"""
MFA router — TOTP-based two-factor authentication.

POST /mfa/setup    — generate secret + QR code URI (not yet active)
POST /mfa/verify   — confirm first TOTP code → activates MFA
DELETE /mfa        — disable MFA (requires current TOTP code)
GET  /mfa/status   — check if MFA is enabled
"""

from __future__ import annotations

import logging
import secrets
import string
from typing import List

import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from ..middleware.auth import get_current_user
from ..middleware.security import get_client_ip, log_security_event
from ..services.db import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/mfa", tags=["mfa"])

_RECOVERY_CODE_COUNT = 8
_RECOVERY_CODE_LEN   = 12


def _generate_recovery_codes() -> List[str]:
    alphabet = string.ascii_uppercase + string.digits
    return [
        "-".join(
            "".join(secrets.choice(alphabet) for _ in range(4))
            for _ in range(3)
        )
        for _ in range(_RECOVERY_CODE_COUNT)
    ]


# ─── Schemas ──────────────────────────────────────────────────────────────────

class MfaSetupResponse(BaseModel):
    secret: str
    totp_uri: str       # otpauth:// URI for QR code generation
    qr_hint: str        # human-readable for manual entry


class MfaVerifyRequest(BaseModel):
    code: str           # 6-digit TOTP code


class MfaVerifyResponse(BaseModel):
    enabled: bool
    recovery_codes: List[str]   # shown ONCE at activation; store offline


class MfaStatusResponse(BaseModel):
    enabled: bool


class MfaDisableRequest(BaseModel):
    code: str           # current TOTP code (or a recovery code)


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/status", response_model=MfaStatusResponse)
async def mfa_status(user: dict = Depends(get_current_user)) -> MfaStatusResponse:
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT verified FROM mfa_secrets WHERE user_id = $1",
        user["sub"],
    )
    return MfaStatusResponse(enabled=bool(row and row["verified"]))


@router.post("/setup", response_model=MfaSetupResponse)
async def mfa_setup(user: dict = Depends(get_current_user)) -> MfaSetupResponse:
    """
    Generate a fresh TOTP secret. Does NOT activate MFA yet — user must
    call /mfa/verify with a valid code first.
    """
    pool = get_pool()
    email = user.get("email", user["sub"])

    # Generate a random base32 secret
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    uri = totp.provisioning_uri(name=email, issuer_name="Mini Manager")

    # Upsert secret (unverified); existing verified MFA is NOT overwritten
    existing = await pool.fetchrow(
        "SELECT verified FROM mfa_secrets WHERE user_id = $1",
        user["sub"],
    )
    if existing and existing["verified"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="MFA is already enabled. Disable it first.",
        )

    await pool.execute(
        """
        INSERT INTO mfa_secrets (user_id, secret, verified)
        VALUES ($1, $2, FALSE)
        ON CONFLICT (user_id) DO UPDATE SET secret = EXCLUDED.secret, verified = FALSE
        """,
        user["sub"], secret,
    )

    return MfaSetupResponse(
        secret=secret,
        totp_uri=uri,
        qr_hint=f"Scan the QR code in your authenticator app, or enter: {secret}",
    )


@router.post("/verify", response_model=MfaVerifyResponse)
async def mfa_verify(
    body: MfaVerifyRequest,
    request: Request,
    user: dict = Depends(get_current_user),
) -> MfaVerifyResponse:
    """Confirm the first TOTP code and activate MFA on the account."""
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT secret, verified FROM mfa_secrets WHERE user_id = $1",
        user["sub"],
    )
    if not row:
        raise HTTPException(status_code=404, detail="Call /mfa/setup first.")
    if row["verified"]:
        raise HTTPException(status_code=409, detail="MFA is already active.")

    totp = pyotp.TOTP(row["secret"])
    if not totp.verify(body.code.strip(), valid_window=1):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid TOTP code.")

    recovery_codes = _generate_recovery_codes()

    await pool.execute(
        """
        UPDATE mfa_secrets
        SET verified = TRUE, recovery_codes = $2, verified_at = NOW()
        WHERE user_id = $1
        """,
        user["sub"], recovery_codes,
    )

    await log_security_event(
        event_type="mfa_enabled",
        user_id=user["sub"],
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    return MfaVerifyResponse(enabled=True, recovery_codes=recovery_codes)


@router.delete("/disable", status_code=200)
async def mfa_disable(
    body: MfaDisableRequest,
    request: Request,
    user: dict = Depends(get_current_user),
) -> dict:
    """Disable MFA. Requires a current TOTP code or a recovery code."""
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT secret, verified, recovery_codes FROM mfa_secrets WHERE user_id = $1",
        user["sub"],
    )
    if not row or not row["verified"]:
        raise HTTPException(status_code=404, detail="MFA is not enabled.")

    code = body.code.strip()
    totp = pyotp.TOTP(row["secret"])
    valid_totp     = totp.verify(code, valid_window=1)
    valid_recovery = code.upper() in (row["recovery_codes"] or [])

    if not valid_totp and not valid_recovery:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Invalid TOTP or recovery code.")

    await pool.execute("DELETE FROM mfa_secrets WHERE user_id = $1", user["sub"])

    await log_security_event(
        event_type="mfa_disabled",
        user_id=user["sub"],
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    return {"ok": True, "message": "MFA has been disabled."}
