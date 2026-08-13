"""
GDPR / Privacy router.

GET    /me/data     — export all data the app holds on this user (JSON)
DELETE /me/account  — permanently delete account and all associated data
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from passlib.context import CryptContext
from pydantic import BaseModel

from ..middleware.auth import get_current_user
from ..middleware.security import get_client_ip, log_security_event
from ..services.db import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/me", tags=["privacy"])

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


class DeleteAccountRequest(BaseModel):
    password: str   # require re-authentication before deletion


# ─── Data export ──────────────────────────────────────────────────────────────

@router.get("/data")
async def export_my_data(
    request: Request,
    user: dict = Depends(get_current_user),
) -> dict:
    """
    Return all data held on the authenticated user.
    Covers: profile, preferences, scans, rules, notifications, file ops, audit log.
    """
    uid = user["sub"]
    pool = get_pool()

    # Gather data from every table concurrently
    profile, prefs, scans, rules, notifs, batches, ops, audit = await _gather_all(uid, pool)

    await log_security_event(
        event_type="data_export",
        user_id=uid,
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    return {
        "export_note": (
            "This is all data Mini Manager holds about you. "
            "You may request deletion at any time via DELETE /api/v1/me/account."
        ),
        "profile":       dict(profile) if profile else {},
        "preferences":   dict(prefs)   if prefs   else {},
        "scans":         [dict(r) for r in scans],
        "rules":         [dict(r) for r in rules],
        "notifications": [dict(r) for r in notifs],
        "batches":       [dict(r) for r in batches],
        "file_ops":      [dict(r) for r in ops],
        "audit_log":     [dict(r) for r in audit],
    }


async def _gather_all(uid: str, pool):
    import asyncio

    async def fetch(sql, *args):
        return await pool.fetch(sql, *args)

    async def fetchrow(sql, *args):
        return await pool.fetchrow(sql, *args)

    return await asyncio.gather(
        fetchrow("SELECT id, email, name, plan, created_at FROM users WHERE id = $1", uid),
        fetchrow("SELECT * FROM user_preferences WHERE user_id = $1", uid),
        fetch("SELECT id, folder_path, file_count, created_at FROM scans WHERE user_id = $1 ORDER BY created_at DESC", uid),
        fetch("SELECT id, natural_text, target_folder, enabled, created_at FROM user_rules WHERE user_id = $1 ORDER BY created_at DESC", uid),
        fetch("SELECT id, kind, title, body, read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 500", uid),
        fetch("SELECT id, label, folder_path, op_count, status, created_at FROM batches WHERE user_id = $1 ORDER BY created_at DESC", uid),
        fetch("SELECT id, batch_id, file_name, from_location, to_location, op_type, created_at FROM file_ops WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1000", uid),
        fetch("SELECT event_type, ip, detail, created_at FROM audit_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200", uid),
    )


# ─── Account deletion ─────────────────────────────────────────────────────────

@router.delete("/account", status_code=200)
async def delete_my_account(
    body: DeleteAccountRequest,
    request: Request,
    user: dict = Depends(get_current_user),
) -> dict:
    """
    Permanently delete the account and ALL associated data.
    Requires password confirmation. Irreversible.
    """
    uid = user["sub"]
    pool = get_pool()

    # Re-verify password before deletion
    row = await pool.fetchrow("SELECT password_hash FROM users WHERE id = $1", uid)
    if not row or not _pwd_ctx.verify(body.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Incorrect password. Account deletion requires password confirmation.",
        )

    # Log before deletion (audit log will be cascade-deleted with user)
    await log_security_event(
        event_type="account_delete",
        user_id=uid,
        ip=get_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )

    # Delete all user data (FK CASCADE handles related tables)
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Tables without FK CASCADE to users
            await conn.execute("DELETE FROM login_attempts WHERE email = (SELECT email FROM users WHERE id = $1)", uid)
            await conn.execute("DELETE FROM audit_log WHERE user_id = $1", uid)
            # This cascades to: user_preferences, scans, notifications, user_rules,
            # batches → file_ops, mfa_secrets
            await conn.execute("DELETE FROM users WHERE id = $1", uid)

    return {
        "ok": True,
        "message": "Your account and all associated data have been permanently deleted.",
    }
