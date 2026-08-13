"""Profile router — get and update user profile, change password."""

from __future__ import annotations

import logging
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


class UpdateProfileRequest(BaseModel):
    name: str
    company: Optional[str] = None
    location: Optional[str] = None
    bio: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


# ─── Auto-migrate profile columns ─────────────────────────────────────────────

_MIGRATE_SQL = """
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS company   TEXT,
    ADD COLUMN IF NOT EXISTS location  TEXT,
    ADD COLUMN IF NOT EXISTS bio       TEXT;
"""

_migrated = False

async def _ensure_columns() -> None:
    global _migrated
    if _migrated:
        return
    pool = get_pool()
    await pool.execute(_MIGRATE_SQL)
    _migrated = True


# ─── GET /profile ─────────────────────────────────────────────────────────────

@router.get("/profile", response_model=ProfileOut)
async def get_profile(user: dict = Depends(get_current_user)) -> ProfileOut:
    await _ensure_columns()
    user_id = user["sub"]
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT id, email, name, plan FROM users WHERE id = $1",
        user_id,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return ProfileOut(
        user_id=str(row["id"]),
        email=row["email"],
        name=row["name"],
        plan=row["plan"],
    )


# ─── PATCH /profile ───────────────────────────────────────────────────────────

@router.patch("/profile", response_model=ProfileOut)
async def update_profile(
    body: UpdateProfileRequest,
    user: dict = Depends(get_current_user),
) -> ProfileOut:
    await _ensure_columns()
    user_id = user["sub"]
    pool = get_pool()
    row = await pool.fetchrow(
        """
        UPDATE users
        SET name     = $2,
            company  = COALESCE($3, company),
            location = COALESCE($4, location),
            bio      = COALESCE($5, bio)
        WHERE id = $1
        RETURNING id, email, name, plan
        """,
        user_id,
        body.name,
        body.company,
        body.location,
        body.bio,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return ProfileOut(
        user_id=str(row["id"]),
        email=row["email"],
        name=row["name"],
        plan=row["plan"],
    )


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
