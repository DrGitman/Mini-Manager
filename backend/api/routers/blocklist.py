"""Blocklist — paths the AI must never touch."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..middleware.auth import get_current_user
from ..services.db import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(tags=["blocklist"])


class BlocklistEntry(BaseModel):
    id: str
    path: str
    reason: Optional[str] = None


class BlocklistAdd(BaseModel):
    path: str
    reason: Optional[str] = None


@router.get("/blocklist", response_model=list[BlocklistEntry])
async def get_blocklist(user: dict = Depends(get_current_user)) -> list[BlocklistEntry]:
    pool = get_pool()
    rows = await pool.fetch(
        "SELECT id::text, path, reason FROM blocklist WHERE user_id = $1 ORDER BY created_at DESC",
        user["sub"],
    )
    return [BlocklistEntry(id=r["id"], path=r["path"], reason=r["reason"]) for r in rows]


@router.post("/blocklist", response_model=BlocklistEntry)
async def add_blocklist(body: BlocklistAdd, user: dict = Depends(get_current_user)) -> BlocklistEntry:
    pool = get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO blocklist (user_id, path, reason)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, path) DO UPDATE SET reason = EXCLUDED.reason
        RETURNING id::text, path, reason
        """,
        user["sub"], body.path.strip(), body.reason,
    )
    logger.info("Blocklist added for user %s: %s", user["sub"], body.path)
    return BlocklistEntry(id=row["id"], path=row["path"], reason=row["reason"])


@router.delete("/blocklist/{entry_id}", status_code=200)
async def remove_blocklist(entry_id: str, user: dict = Depends(get_current_user)) -> dict:
    pool = get_pool()
    await pool.execute(
        "DELETE FROM blocklist WHERE id = $1 AND user_id = $2",
        entry_id, user["sub"],
    )
    return {"ok": True}


async def load_blocklist_paths(user_id: str) -> set[str]:
    """Return the set of protected paths for a user (lower-cased for comparison)."""
    pool = get_pool()
    rows = await pool.fetch("SELECT path FROM blocklist WHERE user_id = $1", user_id)
    return {r["path"].lower() for r in rows}
