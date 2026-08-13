"""GET /scans and POST /scans — scan history for the authenticated user."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ..middleware.auth import get_current_user
from ..models.schemas import ScanCreate, ScanRecord, ScansResponse
from ..services.db import get_pool
from .notifications import create_notification

logger = logging.getLogger(__name__)
router = APIRouter(tags=["scans"])


@router.get("/scans", response_model=ScansResponse)
async def get_scans(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: dict = Depends(get_current_user),
) -> ScansResponse:
    """Return paginated scan history for the current user (newest first)."""
    user_id: str = user["sub"]
    pool = get_pool()

    rows = await pool.fetch(
        """
        SELECT id, user_id, folder_path, file_count, proposals, created_at
        FROM   scans
        WHERE  user_id = $1
        ORDER  BY created_at DESC
        LIMIT  $2 OFFSET $3
        """,
        user_id,
        limit,
        offset,
    )

    total_row = await pool.fetchrow(
        "SELECT COUNT(*) AS cnt FROM scans WHERE user_id = $1", user_id
    )
    total = int(total_row["cnt"]) if total_row else 0

    scans = [
        ScanRecord(
            id=str(row["id"]),
            user_id=str(row["user_id"]),
            folder_path=row["folder_path"],
            file_count=row["file_count"],
            proposals=row["proposals"] or [],
            created_at=row["created_at"],
        )
        for row in rows
    ]

    return ScansResponse(scans=scans, total=total)


@router.post("/scans", response_model=ScanRecord, status_code=status.HTTP_201_CREATED)
async def save_scan(
    body: ScanCreate,
    user: dict = Depends(get_current_user),
) -> ScanRecord:
    """Save a scan result to the database."""
    user_id: str = user["sub"]
    pool = get_pool()

    import json

    row = await pool.fetchrow(
        """
        INSERT INTO scans (user_id, folder_path, file_count, proposals)
        VALUES ($1, $2, $3, $4::jsonb)
        RETURNING id, user_id, folder_path, file_count, proposals, created_at
        """,
        user_id,
        body.folder_path,
        body.file_count,
        json.dumps(body.proposals),
    )

    raw = row["proposals"]
    proposals = json.loads(raw) if isinstance(raw, str) else (raw or [])

    record = ScanRecord(
        id=str(row["id"]),
        user_id=str(row["user_id"]),
        folder_path=row["folder_path"],
        file_count=row["file_count"],
        proposals=proposals,
        created_at=row["created_at"],
    )

    # Count confidence buckets for the notification body
    auto = sum(1 for p in proposals if float(p.get("confidence", 0)) >= 0.85)
    folder_name = body.folder_path.replace("\\", "/").rstrip("/").split("/")[-1]
    await create_notification(
        user_id=user_id,
        kind="scan",
        title="Scan complete",
        body=f"{body.file_count} files scanned in {folder_name}. {auto} ready to auto-apply.",
    )

    return record
