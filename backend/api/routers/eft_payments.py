"""
EFT payments — AI-verified bank transfers for Namibian customers.

Flow:
  1. User claims a plan  -> reference MM-0042 + bank details
  2. User pays from their banking app using that reference
  3. User uploads the proof
  4. Gemini extracts the facts; deterministic rules decide
  5. Clean pass -> Pro activates immediately, marked unreconciled
  6. Owner confirms against the real bank statement, or revokes

Every decision is written to agent_decisions with the extraction, the reasoning
and whether the agent acted alone.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from pydantic import BaseModel

from ..config import settings
from ..middleware.auth import get_current_user
from ..services.db import get_pool
from ..services.payment_proof import (
    ALLOWED_MIME,
    MAX_PROOF_BYTES,
    Decision,
    evaluate,
    extract_proof,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["eft-payments"])

_PLAN_AMOUNTS = {
    "pro": settings.eft_amount_pro,
    "business": settings.eft_amount_business,
}

# Each proof upload costs a Gemini call, so cap it per user rather than per IP —
# an IP limit is trivially sidestepped and would not protect the bill.
_MAX_PROOFS_PER_HOUR = 5
# Claims expose banking details, so cap how fast one account can mint them.
_MAX_CLAIMS_PER_HOUR = 10


def _no_store(response: Response) -> None:
    """
    Bank details must not be cached by browsers, proxies or a CDN.
    Cheap to set, and the alternative is account numbers sitting in caches.
    """
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
    response.headers["Pragma"] = "no-cache"


# â”€â”€â”€ Schemas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class ClaimRequest(BaseModel):
    plan: str = "pro"


class BankDetails(BaseModel):
    account_name: str
    bank: str
    account_number: str
    branch_code: str
    reference: str


class ClaimResponse(BaseModel):
    reference: str
    amount: float
    currency: str
    status: str
    expires_at: datetime
    bank_details: BankDetails
    instructions: str
    # Optional fallback for customers who would rather email their proof.
    # Empty string means the UI hides that option.
    proof_email: str = ""


class ProofResponse(BaseModel):
    decision: str            # activate | review | reject
    status: str
    message: str
    reasoning: str
    confidence: Optional[float] = None
    extracted: Optional[dict[str, Any]] = None


class ClaimSummary(BaseModel):
    id: str
    reference: str
    email: str
    plan: str
    expected_amount: float
    currency: str
    status: str
    created_at: datetime
    activated_at: Optional[datetime] = None
    reconciled_at: Optional[datetime] = None
    confidence: Optional[float] = None
    reasoning: Optional[str] = None
    extracted: Optional[dict[str, Any]] = None


_INSTRUCTIONS = (
    "Use an instant / RTC transfer so your payment reflects immediately. "
    "A standard EFT between different banks can take up to two business days."
)


def _bank_details(reference: str) -> BankDetails:
    return BankDetails(
        account_name=settings.eft_account_name,
        bank=settings.eft_bank_name,
        account_number=settings.eft_account_number,
        branch_code=settings.eft_branch_code,
        reference=reference,
    )


async def _log_decision(
    pool,
    *,
    user_id: str,
    claim_id: str,
    reference: str,
    extracted: dict[str, Any],
    decision: Decision,
    action: str,
    latency_ms: int,
    source: str,
) -> None:
    """Write the agent's reasoning trail. This table is the submission evidence."""
    await pool.execute(
        """
        INSERT INTO agent_decisions
            (user_id, agent, trigger_event, input_json, model, reasoning,
             action_taken, autonomous, confidence, latency_ms, entity_type, entity_id)
        VALUES ($1, 'payment_verification', $2, $3::jsonb, $4, $5, $6, $7, $8, $9,
                'payment_claim', $10)
        """,
        user_id,
        f"proof_{source}",
        json.dumps({"reference": reference, "extracted": extracted}),
        settings.gemini_model,
        f"{extracted.get('reasoning', '')} | {decision.explain()}",
        action,
        decision.action != "review",   # deferring to a human is not autonomous
        float(extracted.get("confidence") or 0.0),
        latency_ms,
        claim_id,
    )


# â”€â”€â”€ POST /payments/eft/claim â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.post("/payments/eft/claim", response_model=ClaimResponse)
async def create_claim(
    body: ClaimRequest,
    response: Response,
    user: dict = Depends(get_current_user),
) -> ClaimResponse:
    """Reserve a reference and show the customer where to send the money."""
    _no_store(response)

    if body.plan not in _PLAN_AMOUNTS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unknown plan")
    if not settings.eft_account_number:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "EFT payments are not configured yet.",
        )

    pool = get_pool()
    user_id = user["sub"]

    # Stop one account minting claims in bulk to harvest the banking details.
    recent_claims = await pool.fetchval(
        "SELECT COUNT(*) FROM payment_claims WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'",
        user_id,
    )
    if recent_claims and recent_claims >= _MAX_CLAIMS_PER_HOUR:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many payment requests. Please try again later.",
        )

    # Reuse an open claim rather than minting a new reference each visit —
    # otherwise a customer who reloads the page pays against a stale reference.
    existing = await pool.fetchrow(
        """
        SELECT reference, expected_amount, currency, status, expires_at
        FROM payment_claims
        WHERE user_id = $1 AND plan = $2
          AND status IN ('awaiting_proof', 'needs_review')
          AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 1
        """,
        user_id, body.plan,
    )
    if existing:
        return ClaimResponse(
            reference=existing["reference"],
            amount=float(existing["expected_amount"]),
            currency=existing["currency"],
            status=existing["status"],
            expires_at=existing["expires_at"],
            bank_details=_bank_details(existing["reference"]),
            instructions=_INSTRUCTIONS,
            proof_email=settings.eft_proof_email,
        )

    seq = await pool.fetchval("SELECT nextval('payment_reference_seq')")
    reference = f"MM-{seq:04d}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.eft_claim_expiry_days)

    row = await pool.fetchrow(
        """
        INSERT INTO payment_claims
            (reference, user_id, plan, expected_amount, currency, expires_at)
        VALUES ($1, $2, $3, $4, $6, $5)
        RETURNING reference, expected_amount, currency, status, expires_at
        """,
        reference, user_id, body.plan, _PLAN_AMOUNTS[body.plan], expires_at,
        settings.eft_currency,
    )
    logger.info("EFT claim %s created for user %s (%s)", reference, user_id, body.plan)

    return ClaimResponse(
        reference=row["reference"],
        amount=float(row["expected_amount"]),
        currency=row["currency"],
        status=row["status"],
        expires_at=row["expires_at"],
        bank_details=_bank_details(row["reference"]),
        instructions=_INSTRUCTIONS,
        proof_email=settings.eft_proof_email,
    )


# â”€â”€â”€ POST /payments/eft/proof â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.post("/payments/eft/proof", response_model=ProofResponse)
async def upload_proof(
    reference: str,
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
) -> ProofResponse:
    """The agent reads the document and decides whether to activate."""
    started = time.monotonic()
    pool = get_pool()
    user_id = user["sub"]

    claim = await pool.fetchrow(
        """
        SELECT id, reference, user_id, plan, expected_amount, currency,
               status, created_at, expires_at
        FROM payment_claims WHERE reference = $1
        """,
        reference,
    )
    if not claim:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown payment reference")
    if str(claim["user_id"]) != user_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This reference is not yours")

    # Cap uploads per user per hour. Each one is a paid Gemini call, so this is
    # a cost control as much as an abuse control. Enforced in the database so it
    # survives restarts and cannot be dodged by changing IP.
    recent_proofs = await pool.fetchval(
        """
        SELECT COUNT(*) FROM payment_proofs p
        JOIN payment_claims c ON c.id = p.claim_id
        WHERE c.user_id = $1 AND p.created_at > NOW() - INTERVAL '1 hour'
        """,
        user_id,
    )
    if recent_proofs and recent_proofs >= _MAX_PROOFS_PER_HOUR:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many upload attempts. Please try again in an hour, or contact support.",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Empty file")
    if len(data) > MAX_PROOF_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "Proof must be 10 MB or smaller",
        )
    mime = (file.content_type or "").split(";")[0].strip()
    if mime not in ALLOWED_MIME:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Upload a PDF, PNG, JPEG or WebP",
        )

    # The same document can never be reused, by anyone.
    file_hash = hashlib.sha256(data).hexdigest()
    if await pool.fetchval("SELECT 1 FROM payment_proofs WHERE file_hash = $1", file_hash):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This document has already been submitted.",
        )

    extracted = await extract_proof(data, mime)
    decision = evaluate(extracted, dict(claim))

    claim_id = str(claim["id"])
    if decision.action == "activate":
        new_status = "ai_verified"
        await pool.execute(
            "UPDATE payment_claims SET status = $2, activated_at = NOW() WHERE id = $1",
            claim["id"], new_status,
        )
        await pool.execute(
            "UPDATE users SET plan = $2 WHERE id = $1", claim["user_id"], claim["plan"],
        )
        action = f"Activated {claim['plan']} for user {claim['user_id']}"
        message = (
            f"Payment verified — your {claim['plan'].title()} plan is active. "
            "We'll confirm it against our bank statement shortly."
        )
    elif decision.action == "review":
        new_status = "needs_review"
        await pool.execute(
            "UPDATE payment_claims SET status = $2 WHERE id = $1", claim["id"], new_status,
        )
        action = "Queued for human review"
        message = (
            "Thanks — we've received your proof. Something needs a quick human check, "
            "so your plan will activate shortly."
        )
    else:
        new_status = "rejected"
        await pool.execute(
            "UPDATE payment_claims SET status = $2 WHERE id = $1", claim["id"], new_status,
        )
        action = "Rejected"
        message = "We couldn't verify this document. " + decision.explain()

    await pool.execute(
        """
        INSERT INTO payment_proofs
            (claim_id, source, file_hash, mime_type, extracted, confidence,
             decision, reasoning)
        VALUES ($1, 'upload', $2, $3, $4::jsonb, $5, $6, $7)
        """,
        claim["id"], file_hash, mime, json.dumps(extracted),
        float(extracted.get("confidence") or 0.0), decision.action, decision.explain(),
    )

    await _log_decision(
        pool,
        user_id=user_id,
        claim_id=claim_id,
        reference=claim["reference"],
        extracted=extracted,
        decision=decision,
        action=action,
        latency_ms=int((time.monotonic() - started) * 1000),
        source="upload",
    )

    logger.info(
        "Payment agent: %s for %s (confidence %.2f) — %s",
        decision.action, claim["reference"],
        float(extracted.get("confidence") or 0.0), decision.explain(),
    )

    return ProofResponse(
        decision=decision.action,
        status=new_status,
        message=message,
        reasoning=decision.explain(),
        confidence=float(extracted.get("confidence") or 0.0),
        extracted=extracted,
    )


# â”€â”€â”€ GET /payments/eft/claim/{reference} â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/payments/eft/claim/{reference}", response_model=ClaimResponse)
async def get_claim(
    reference: str,
    response: Response,
    user: dict = Depends(get_current_user),
) -> ClaimResponse:
    _no_store(response)
    pool = get_pool()
    row = await pool.fetchrow(
        """
        SELECT reference, user_id, expected_amount, currency, status, expires_at
        FROM payment_claims WHERE reference = $1
        """,
        reference,
    )
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown payment reference")
    if str(row["user_id"]) != user["sub"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This reference is not yours")

    return ClaimResponse(
        reference=row["reference"],
        amount=float(row["expected_amount"]),
        currency=row["currency"],
        status=row["status"],
        expires_at=row["expires_at"],
        bank_details=_bank_details(row["reference"]),
        instructions=_INSTRUCTIONS,
        proof_email=settings.eft_proof_email,
    )


# â”€â”€â”€ Admin reconciliation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
#
# Gated on the owner's email rather than a role column, to keep this small.
# Set EFT_ADMIN_EMAIL to your account.

def _require_admin(user: dict) -> None:
    admin = (settings.eft_admin_email or "").strip().lower()
    if not admin or (user.get("email") or "").lower() != admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admins only")


@router.get("/admin/payments", response_model=list[ClaimSummary])
async def list_payments(user: dict = Depends(get_current_user)) -> list[ClaimSummary]:
    _require_admin(user)
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT c.id, c.reference, u.email, c.plan, c.expected_amount, c.currency,
               c.status, c.created_at, c.activated_at, c.reconciled_at,
               p.confidence, p.reasoning, p.extracted
        FROM payment_claims c
        JOIN users u ON u.id = c.user_id
        LEFT JOIN LATERAL (
            SELECT confidence, reasoning, extracted
            FROM payment_proofs
            WHERE claim_id = c.id
            ORDER BY created_at DESC LIMIT 1
        ) p ON TRUE
        ORDER BY c.created_at DESC
        LIMIT 200
        """
    )
    return [
        ClaimSummary(
            id=str(r["id"]),
            reference=r["reference"],
            email=r["email"],
            plan=r["plan"],
            expected_amount=float(r["expected_amount"]),
            currency=r["currency"],
            status=r["status"],
            created_at=r["created_at"],
            activated_at=r["activated_at"],
            reconciled_at=r["reconciled_at"],
            confidence=float(r["confidence"]) if r["confidence"] is not None else None,
            reasoning=r["reasoning"],
            extracted=json.loads(r["extracted"]) if isinstance(r["extracted"], str) else r["extracted"],
        )
        for r in rows
    ]


@router.post("/admin/payments/{claim_id}/confirm")
async def confirm_payment(claim_id: str, user: dict = Depends(get_current_user)) -> dict:
    """Owner has seen the money on the bank statement."""
    _require_admin(user)
    pool = get_pool()
    row = await pool.fetchrow(
        """
        UPDATE payment_claims
        SET status = 'reconciled', reconciled_at = NOW(), reconciled_by = $2
        WHERE id = $1
        RETURNING user_id, plan, reference
        """,
        claim_id, user.get("email"),
    )
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown claim")
    # Activate here too, in case it had been queued for review rather than
    # auto-activated.
    await pool.execute("UPDATE users SET plan = $2 WHERE id = $1", row["user_id"], row["plan"])
    logger.info("Payment %s reconciled by %s", row["reference"], user.get("email"))
    return {"ok": True, "status": "reconciled"}


@router.post("/admin/payments/{claim_id}/reject")
async def reject_payment(claim_id: str, user: dict = Depends(get_current_user)) -> dict:
    """Money never landed — revoke access and downgrade."""
    _require_admin(user)
    pool = get_pool()
    row = await pool.fetchrow(
        "UPDATE payment_claims SET status = 'rejected' WHERE id = $1 RETURNING user_id, reference",
        claim_id,
    )
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown claim")
    await pool.execute("UPDATE users SET plan = 'free' WHERE id = $1", row["user_id"])
    logger.info("Payment %s rejected by %s — user downgraded", row["reference"], user.get("email"))
    return {"ok": True, "status": "rejected"}

