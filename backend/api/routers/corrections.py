"""POST /corrections — log a user correction so the AI can learn from it."""

from __future__ import annotations

import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..middleware.auth import get_current_user
from ..services.db import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(tags=["corrections"])


class CorrectionCreate(BaseModel):
    pattern: str                          # e.g. "pdf, name contains 'invoice'"
    proposed: str                         # what AI suggested
    corrected: str                        # what user changed it to (or "rejected")
    field: Literal["target_folder", "new_name", "rejected"] = "target_folder"


@router.post("/corrections", status_code=200)
async def log_correction(
    body: CorrectionCreate,
    user: dict = Depends(get_current_user),
) -> dict:
    """Record that the user overrode or rejected an AI proposal."""
    pool = get_pool()
    await pool.execute(
        """
        INSERT INTO corrections (user_id, pattern, proposed, corrected, field)
        VALUES ($1, $2, $3, $4, $5)
        """,
        user["sub"],
        body.pattern[:500],
        body.proposed[:500],
        body.corrected[:500],
        body.field,
    )
    logger.info("Correction logged for user %s: %s → %s (%s)", user["sub"], body.proposed, body.corrected, body.field)
    return {"ok": True}


async def get_corrections_hint(user_id: str) -> str:
    """Load last 20 corrections for a user and format as a prompt hint."""
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT pattern, proposed, corrected, field
        FROM   corrections
        WHERE  user_id = $1
        ORDER  BY created_at DESC
        LIMIT  20
        """,
        user_id,
    )
    if not rows:
        return ""

    lines = ["\nUSER CORRECTIONS (the user has previously overridden these — respect them exactly):"]
    for r in rows:
        if r["field"] == "rejected":
            lines.append(f"- File matching '{r['pattern']}': user REJECTED the proposal to move to '{r['proposed']}'")
        else:
            lines.append(f"- File matching '{r['pattern']}': you proposed {r['field']}='{r['proposed']}', user changed to '{r['corrected']}'")
    return "\n".join(lines)


@router.post("/applied", status_code=200)
async def mark_applied(
    body: dict,
    user: dict = Depends(get_current_user),
) -> dict:
    """Record applied file fingerprints for idempotency checking."""
    pool = get_pool()
    entries: list[dict] = body.get("entries", [])
    if not entries:
        return
    async with pool.acquire() as conn:
        async with conn.transaction():
            for entry in entries[:500]:
                fp = entry.get("fingerprint", "")
                path = entry.get("applied_path", "")
                if not fp or not path:
                    continue
                await conn.execute(
                    """
                    INSERT INTO applied_files (user_id, fingerprint, applied_path)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (user_id, fingerprint) DO UPDATE SET
                        applied_path = EXCLUDED.applied_path,
                        applied_at   = NOW()
                    """,
                    user["sub"], fp[:64], path[:1000],
                )
    return {"ok": True, "count": len(entries)}
