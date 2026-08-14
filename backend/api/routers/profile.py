"""Profile router — get and update user profile, change password."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from passlib.context import CryptContext
from pydantic import BaseModel

from ..middleware.auth import get_current_user
from ..services.db import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(tags=["profile"])

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ─── Schemas ──────────────────────────────────────────────────────────────────

class ProfileOut(BaseModel):
    user_id: str
    email: str
    name: str
    plan: str
    company: Optional[str] = None
    location: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: Optional[datetime] = None


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class DeleteAccountRequest(BaseModel):
    password: str


# Avatars are stored inline as data: URLs. The client downscales to 256x256
# first; this is the backstop so a hand-rolled request can't bloat the row.
_MAX_AVATAR_CHARS = 200_000
_UPDATABLE_COLUMNS = ("name", "company", "location", "bio", "avatar_url")


# ─── Auto-migrate profile columns ─────────────────────────────────────────────

_MIGRATE_SQL = """
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS company             TEXT,
    ADD COLUMN IF NOT EXISTS location            TEXT,
    ADD COLUMN IF NOT EXISTS bio                 TEXT,
    ADD COLUMN IF NOT EXISTS avatar_url          TEXT,
    ADD COLUMN IF NOT EXISTS sessions_valid_from TIMESTAMPTZ;
"""

_migrated = False

async def _ensure_columns() -> None:
    global _migrated
    if _migrated:
        return
    pool = get_pool()
    await pool.execute(_MIGRATE_SQL)
    _migrated = True


_PROFILE_COLUMNS = (
    "id, email, name, plan, company, location, bio, avatar_url, created_at"
)


def _to_profile(row) -> ProfileOut:
    return ProfileOut(
        user_id=str(row["id"]),
        email=row["email"],
        name=row["name"],
        plan=row["plan"],
        company=row["company"],
        location=row["location"],
        bio=row["bio"],
        avatar_url=row["avatar_url"],
        created_at=row["created_at"],
    )


# ─── GET /profile ─────────────────────────────────────────────────────────────

@router.get("/profile", response_model=ProfileOut)
async def get_profile(user: dict = Depends(get_current_user)) -> ProfileOut:
    await _ensure_columns()
    user_id = user["sub"]
    pool = get_pool()
    row = await pool.fetchrow(
        f"SELECT {_PROFILE_COLUMNS} FROM users WHERE id = $1",
        user_id,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _to_profile(row)


# ─── PATCH /profile ───────────────────────────────────────────────────────────

@router.patch("/profile", response_model=ProfileOut)
async def update_profile(
    body: UpdateProfileRequest,
    user: dict = Depends(get_current_user),
) -> ProfileOut:
    await _ensure_columns()
    user_id = user["sub"]
    pool = get_pool()

    # Only touch the fields the client actually sent, so a partial PATCH can't
    # wipe the others — but a field sent as null/"" IS cleared (no COALESCE).
    sent = body.model_fields_set
    columns = [c for c in _UPDATABLE_COLUMNS if c in sent]
    if not columns:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update"
        )

    if "name" in columns and not (body.name or "").strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Name cannot be empty"
        )

    if body.avatar_url and len(body.avatar_url) > _MAX_AVATAR_CHARS:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image is too large — please choose a smaller photo",
        )

    assignments = ", ".join(f"{col} = ${i + 2}" for i, col in enumerate(columns))
    values = [getattr(body, col) for col in columns]

    row = await pool.fetchrow(
        f"""
        UPDATE users
        SET {assignments}
        WHERE id = $1
        RETURNING {_PROFILE_COLUMNS}
        """,
        user_id,
        *values,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return _to_profile(row)


# ─── POST /profile/password ───────────────────────────────────────────────────

@router.post("/profile/password")
async def change_password(
    body: ChangePasswordRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    user_id = user["sub"]
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT password_hash FROM users WHERE id = $1",
        user_id,
    )
    if not row or not _pwd_ctx.verify(body.old_password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )
    new_hash = _pwd_ctx.hash(body.new_password)
    await pool.execute(
        "UPDATE users SET password_hash = $2 WHERE id = $1",
        user_id,
        new_hash,
    )
    return {"ok": True}


# ─── POST /profile/sign-out-all ───────────────────────────────────────────────

@router.post("/profile/sign-out-all")
async def sign_out_all_devices(user: dict = Depends(get_current_user)) -> dict:
    """
    Revoke every access token issued so far, including the caller's.

    Stamps sessions_valid_from = NOW(); get_current_user rejects any token whose
    `iat` predates it. The client must sign in again afterwards.
    """
    await _ensure_columns()
    pool = get_pool()
    row = await pool.fetchrow(
        "UPDATE users SET sessions_valid_from = NOW() WHERE id = $1 RETURNING id",
        user["sub"],
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    logger.info("All sessions revoked for user %s", user["sub"])
    return {"ok": True}


# ─── DELETE /profile ──────────────────────────────────────────────────────────

@router.delete("/profile")
async def delete_account(
    body: DeleteAccountRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    """
    Permanently delete the account. Requires the current password.

    Every user-owned table declares ON DELETE CASCADE / SET NULL, so removing
    the row removes the associated data too.
    """
    user_id = user["sub"]
    pool = get_pool()
    row = await pool.fetchrow("SELECT password_hash FROM users WHERE id = $1", user_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not _pwd_ctx.verify(body.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Password is incorrect",
        )
    await pool.execute("DELETE FROM users WHERE id = $1", user_id)
    logger.info("Account deleted: %s", user_id)
    return {"ok": True}
