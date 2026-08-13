"""GET /insights — duplicate detection and stale file analysis from scan history."""

from __future__ import annotations

import json
import logging
import time
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List, Literal, Optional

from ..middleware.auth import get_current_user
from ..services.db import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(tags=["insights"])

# Files unchanged for longer than this are considered stale
STALE_DAYS = 90
STALE_SECONDS = STALE_DAYS * 86400


# ─── Response schemas ─────────────────────────────────────────────────────────

class FileSide(BaseModel):
    name: str
    size: int
    ext: str
    scan_date: str


class DuplicatePair(BaseModel):
    id: str
    fileA: FileSide
    fileB: FileSide
    similarity: Literal["exact-size", "name-variant"]


class StaleFile(BaseModel):
    id: str
    name: str
    size: int
    extension: str
    modified_at: int        # unix ms
    days_unchanged: int
    category: str


class InsightsResponse(BaseModel):
    duplicates: List[DuplicatePair]
    stale_files: List[StaleFile]
    total_size_bytes: int
    duplicate_size_bytes: int
    stale_size_bytes: int


# ─── Route ────────────────────────────────────────────────────────────────────

@router.get("/insights", response_model=InsightsResponse)
async def get_insights(user: dict = Depends(get_current_user)) -> InsightsResponse:
    user_id: str = user["sub"]
    pool = get_pool()

    # Pull all scans for this user (newest first, cap at 20 to keep it fast)
    rows = await pool.fetch(
        """
        SELECT id, proposals, created_at
        FROM   scans
        WHERE  user_id = $1
        ORDER  BY created_at DESC
        LIMIT  20
        """,
        user_id,
    )

    # Flatten all proposal entries with their scan metadata
    all_files: list[dict] = []
    for row in rows:
        raw = row["proposals"]
        proposals = json.loads(raw) if isinstance(raw, str) else (raw or [])
        scan_date = row["created_at"].strftime("%b %d, %Y") if hasattr(row["created_at"], "strftime") else str(row["created_at"])
        scan_id = str(row["id"])
        for p in proposals:
            size = int(p.get("size", 0))
            if size == 0:
                continue
            name = p.get("name") or p.get("new_name") or ""
            ext = (p.get("extension") or "").lstrip(".")
            if not ext and "." in name:
                ext = name.rsplit(".", 1)[-1].lower()
            all_files.append({
                "name": name,
                "ext": ext.lower(),
                "size": size,
                "category": p.get("category", "Other"),
                "modified_at": p.get("modified_at", 0),
                "scan_date": scan_date,
                "scan_id": scan_id,
            })

    total_size = sum(f["size"] for f in all_files)
    now_ms = int(time.time() * 1000)

    # ── Duplicate detection ──────────────────────────────────────────────────
    # Group by (size, ext) — exact same byte count + extension = likely duplicate
    size_groups: dict[tuple, list[dict]] = defaultdict(list)
    for f in all_files:
        if f["size"] > 1024:  # skip tiny files (< 1 KB)
            key = (f["size"], f["ext"])
            size_groups[key].append(f)

    duplicates: list[DuplicatePair] = []
    seen_pairs: set[frozenset] = set()
    pair_idx = 0

    for (size, ext), group in size_groups.items():
        if len(group) < 2:
            continue
        # Emit pairs (cap at 3 pairs per size-group to avoid explosion)
        for i in range(min(len(group) - 1, 3)):
            a, b = group[i], group[i + 1]
            pair_key = frozenset([a["name"], b["name"]])
            if pair_key in seen_pairs or a["name"] == b["name"]:
                continue
            seen_pairs.add(pair_key)

            # Determine similarity label
            a_stem = a["name"].rsplit(".", 1)[0].lower() if "." in a["name"] else a["name"].lower()
            b_stem = b["name"].rsplit(".", 1)[0].lower() if "." in b["name"] else b["name"].lower()
            copy_hints = ("copy", "copy of", "(2)", "(3)", "-copy", "_copy", "final", "v2", "v3")
            is_variant = any(h in a_stem or h in b_stem for h in copy_hints)

            duplicates.append(DuplicatePair(
                id=f"dp{pair_idx}",
                fileA=FileSide(name=a["name"], size=a["size"], ext=a["ext"], scan_date=a["scan_date"]),
                fileB=FileSide(name=b["name"], size=b["size"], ext=b["ext"], scan_date=b["scan_date"]),
                similarity="name-variant" if is_variant else "exact-size",
            ))
            pair_idx += 1
            if pair_idx >= 10:  # cap at 10 pairs shown
                break
        if pair_idx >= 10:
            break

    duplicate_size = sum(
        d.fileB.size for d in duplicates  # count the "extra" copy
    )

    # ── Stale file detection ──────────────────────────────────────────────────
    stale_files: list[StaleFile] = []
    seen_stale: set[str] = set()

    for idx, f in enumerate(all_files):
        mod = f.get("modified_at", 0)
        if mod <= 0:
            continue
        # modified_at is stored as unix ms from the browser
        mod_ms = mod if mod > 1e10 else mod * 1000
        age_days = int((now_ms - mod_ms) / 86400000)
        if age_days < STALE_DAYS:
            continue
        key = f["name"]
        if key in seen_stale:
            continue
        seen_stale.add(key)

        stale_files.append(StaleFile(
            id=f"sf{idx}",
            name=f["name"],
            size=f["size"],
            extension=f["ext"],
            modified_at=int(mod_ms),
            days_unchanged=age_days,
            category=f["category"],
        ))
        if len(stale_files) >= 20:
            break

    stale_size = sum(s.size for s in stale_files)

    return InsightsResponse(
        duplicates=duplicates,
        stale_files=sorted(stale_files, key=lambda s: s.days_unchanged, reverse=True),
        total_size_bytes=total_size,
        duplicate_size_bytes=duplicate_size,
        stale_size_bytes=stale_size,
    )
