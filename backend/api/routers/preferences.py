"""GET /preferences and PUT /preferences — user organisation preferences."""

from __future__ import annotations

import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from typing import List

from ..middleware.auth import get_current_user
from ..services.db import get_pool

# Allow absolute paths including Windows drive letters (C:\...) and UNC paths
# Only reject truly dangerous characters: <, >, ", |, ?, *, null bytes
_SAFE_FOLDER_RE = re.compile(r'^[^<>"|?*\x00-\x1f]+$')

def _validate_folder(path: str) -> str:
    """Reject paths with traversal sequences or null bytes."""
    if not path or not path.strip():
        raise ValueError("Folder path must not be empty")
    if ".." in path.replace("\\", "/").split("/"):
        raise ValueError("Path traversal not allowed")
    if not _SAFE_FOLDER_RE.match(path):
        raise ValueError("Folder path contains invalid characters")
    if len(path) > 512:
        raise ValueError("Folder path too long")
    return path.strip()

router = APIRouter(tags=["preferences"])

# ─── Auto-migrate: add new columns if they don't exist ────────────────────────

_MIGRATE_SQL = """
ALTER TABLE user_preferences
    ADD COLUMN IF NOT EXISTS naming_convention  TEXT    NOT NULL DEFAULT 'date-subject',
    ADD COLUMN IF NOT EXISTS auto_threshold     FLOAT   NOT NULL DEFAULT 0.85,
    ADD COLUMN IF NOT EXISTS review_threshold   FLOAT   NOT NULL DEFAULT 0.70,
    ADD COLUMN IF NOT EXISTS monitor_downloads  BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS monitor_desktop    BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS monitor_documents  BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS custom_folders     TEXT[]  NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS notif_scan         BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notif_apply        BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notif_digest       BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS notif_tips         BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS notif_marketing    BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS theme              TEXT    NOT NULL DEFAULT 'light',
    ADD COLUMN IF NOT EXISTS quick_scan_hidden  TEXT[]  NOT NULL DEFAULT '{}';
"""

_migrated = False

async def _ensure_columns() -> None:
    global _migrated
    if _migrated:
        return
    pool = get_pool()
    await pool.execute(_MIGRATE_SQL)
    _migrated = True


# ─── Schema ───────────────────────────────────────────────────────────────────

class Preferences(BaseModel):
    # Legacy fields (kept for classify/explain context)
    naming_style: str = "title"
    categories: List[str] = ["Documents", "Images", "Videos", "Audio", "Code", "Archives"]
    target_folder: str = "Desktop"
    quarantine_mode: str = "auto"

    # Extended fields
    naming_convention: str = "date-subject"
    auto_threshold: float = 0.85
    review_threshold: float = 0.70
    monitor_downloads: bool = True
    monitor_desktop: bool = False
    monitor_documents: bool = False
    custom_folders: List[str] = []

    @field_validator("custom_folders", mode="before")
    @classmethod
    def validate_custom_folders(cls, v: List[str]) -> List[str]:
        validated = []
        for path in (v or []):
            validated.append(_validate_folder(path))
        return validated[:20]  # cap at 20 entries
    # Folders the user has hidden from Quick Scan. Everything in
    # custom_folders is scanned; this only controls the shortcut list, so the
    # default (empty) means every folder they added shows up.
    quick_scan_hidden: List[str] = []

    @field_validator("quick_scan_hidden", mode="before")
    @classmethod
    def validate_quick_scan_hidden(cls, v: List[str]) -> List[str]:
        return [str(p) for p in (v or [])][:20]

    notif_scan: bool = True
    notif_apply: bool = True
    notif_digest: bool = False
    notif_tips: bool = True
    notif_marketing: bool = False
    theme: str = "light"


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/preferences", response_model=Preferences)
async def get_preferences(user: dict = Depends(get_current_user)) -> Preferences:
    await _ensure_columns()
    pool = get_pool()
    row = await pool.fetchrow(
        """
        SELECT naming_style, categories, target_folder, quarantine_mode,
               naming_convention, auto_threshold, review_threshold,
               monitor_downloads, monitor_desktop, monitor_documents,
               custom_folders, quick_scan_hidden, notif_scan, notif_apply, notif_digest,
               notif_tips, notif_marketing, theme
        FROM   user_preferences
        WHERE  user_id = $1
        """,
        user["sub"],
    )
    if not row:
        return Preferences()
    return Preferences(
        naming_style=row["naming_style"],
        categories=list(row["categories"]),
        target_folder=row["target_folder"],
        quarantine_mode=row["quarantine_mode"],
        naming_convention=row["naming_convention"],
        auto_threshold=float(row["auto_threshold"]),
        review_threshold=float(row["review_threshold"]),
        monitor_downloads=row["monitor_downloads"],
        monitor_desktop=row["monitor_desktop"],
        monitor_documents=row["monitor_documents"],
        custom_folders=list(row["custom_folders"] or []),
        quick_scan_hidden=list(row["quick_scan_hidden"] or []),
        notif_scan=row["notif_scan"],
        notif_apply=row["notif_apply"],
        notif_digest=row["notif_digest"],
        notif_tips=row["notif_tips"],
        notif_marketing=row["notif_marketing"],
        theme=row["theme"],
    )


@router.put("/preferences", response_model=Preferences)
async def save_preferences(
    body: Preferences,
    user: dict = Depends(get_current_user),
) -> Preferences:
    await _ensure_columns()
    pool = get_pool()
    await pool.execute(
        """
        INSERT INTO user_preferences (
            user_id, naming_style, categories, target_folder, quarantine_mode,
            naming_convention, auto_threshold, review_threshold,
            monitor_downloads, monitor_desktop, monitor_documents,
            custom_folders, quick_scan_hidden, notif_scan, notif_apply, notif_digest,
            notif_tips, notif_marketing, theme
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        ON CONFLICT (user_id) DO UPDATE SET
            naming_style      = EXCLUDED.naming_style,
            categories        = EXCLUDED.categories,
            target_folder     = EXCLUDED.target_folder,
            quarantine_mode   = EXCLUDED.quarantine_mode,
            naming_convention = EXCLUDED.naming_convention,
            auto_threshold    = EXCLUDED.auto_threshold,
            review_threshold  = EXCLUDED.review_threshold,
            monitor_downloads = EXCLUDED.monitor_downloads,
            monitor_desktop   = EXCLUDED.monitor_desktop,
            monitor_documents = EXCLUDED.monitor_documents,
            custom_folders    = EXCLUDED.custom_folders,
            quick_scan_hidden = EXCLUDED.quick_scan_hidden,
            notif_scan        = EXCLUDED.notif_scan,
            notif_apply       = EXCLUDED.notif_apply,
            notif_digest      = EXCLUDED.notif_digest,
            notif_tips        = EXCLUDED.notif_tips,
            notif_marketing   = EXCLUDED.notif_marketing,
            theme             = EXCLUDED.theme,
            updated_at        = NOW()
        """,
        user["sub"],
        body.naming_style,
        body.categories,
        body.target_folder,
        body.quarantine_mode,
        body.naming_convention,
        body.auto_threshold,
        body.review_threshold,
        body.monitor_downloads,
        body.monitor_desktop,
        body.monitor_documents,
        body.custom_folders,
        body.quick_scan_hidden,
        body.notif_scan,
        body.notif_apply,
        body.notif_digest,
        body.notif_tips,
        body.notif_marketing,
        body.theme,
    )
    return body
