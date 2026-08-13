"""GET /stats — dashboard statistics derived from real scan data."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..middleware.auth import get_current_user
from ..services.db import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(tags=["stats"])


# ─── Response schemas ─────────────────────────────────────────────────────────

class ProposalBuckets(BaseModel):
    auto: int       # confidence >= 0.85
    review: int     # 0.70 <= confidence < 0.85
    manual: int     # confidence < 0.70


class RecentScan(BaseModel):
    id: str
    folder_path: str
    file_count: int
    created_at: datetime
    proposal_count: int


class TopFile(BaseModel):
    name: str
    size_bytes: int
    category: str


class StatsResponse(BaseModel):
    total_files_scanned: int        # sum of file_count across all scans
    total_scans: int                # number of scans
    ready_to_organise: int          # proposals in auto + review buckets (latest scan)
    proposals: ProposalBuckets      # confidence breakdown from latest scan
    recent_scans: list[RecentScan]  # last 5 scans
    top_files: list[TopFile]        # largest files from latest scan (up to 5)


# ─── Route ────────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=StatsResponse)
async def get_stats(user: dict = Depends(get_current_user)) -> StatsResponse:
    user_id: str = user["sub"]
    pool = get_pool()

    # Total files scanned + total scan count
    agg = await pool.fetchrow(
        "SELECT COUNT(*) AS scan_count, COALESCE(SUM(file_count), 0) AS total_files FROM scans WHERE user_id = $1",
        user_id,
    )
    total_scans = int(agg["scan_count"]) if agg else 0
    total_files = int(agg["total_files"]) if agg else 0

    # Recent scans (last 5)
    rows = await pool.fetch(
        """
        SELECT id, folder_path, file_count, proposals, created_at
        FROM   scans
        WHERE  user_id = $1
        ORDER  BY created_at DESC
        LIMIT  5
        """,
        user_id,
    )

    recent_scans: list[RecentScan] = []
    latest_proposals: list[dict] = []

    for i, row in enumerate(rows):
        raw = row["proposals"]
        proposals = json.loads(raw) if isinstance(raw, str) else (raw or [])
        if i == 0:
            latest_proposals = proposals
        recent_scans.append(RecentScan(
            id=str(row["id"]),
            folder_path=row["folder_path"],
            file_count=row["file_count"],
            created_at=row["created_at"],
            proposal_count=len(proposals),
        ))

    # Bucket proposals from the latest scan by confidence
    auto = review = manual = 0
    top_files_raw: list[dict] = []

    for p in latest_proposals:
        conf = float(p.get("confidence", 0))
        if conf >= 0.85:
            auto += 1
        elif conf >= 0.70:
            review += 1
        else:
            manual += 1

        size = int(p.get("size", 0))
        if size > 0:
            top_files_raw.append({
                "name": p.get("name", p.get("new_name", "unknown")),
                "size_bytes": size,
                "category": p.get("category", "Other"),
            })

    # Top 5 files by size
    top_files_raw.sort(key=lambda f: f["size_bytes"], reverse=True)
    top_files = [TopFile(**f) for f in top_files_raw[:5]]

    return StatsResponse(
        total_files_scanned=total_files,
        total_scans=total_scans,
        ready_to_organise=auto + review,
        proposals=ProposalBuckets(auto=auto, review=review, manual=manual),
        recent_scans=recent_scans,
        top_files=top_files,
    )
