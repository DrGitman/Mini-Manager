"""
Where a paused agent is kept between turns.

An interrupt only works if the agent that raised it still exists when the user
answers. Without persistence that agent dies with the process, and on Render
the process recycles on every deploy — so an autonomous run that stopped to ask
a question would simply never resume, silently.

Strands persists sessions on top of a Storage backend. This module picks the
backend from configuration so the choice is one setting rather than an import
scattered through the routes:

    local / development   FileSessionManager   — provable today, no AWS needed
    Render / production   S3SessionManager     — survives a deploy

Render's filesystem is ephemeral, so FileSessionManager there is a trap: it
works in testing and loses state exactly when a deploy happens. Set
SESSION_BACKEND=s3 with a bucket before relying on autonomy in production.
"""

from __future__ import annotations

import logging
import pathlib
from typing import Optional

from ..config import settings

logger = logging.getLogger(__name__)

_warned_ephemeral = False


def build_session_manager(session_id: str):
    """
    A session manager for this conversation, or None to run without persistence.

    Returning None is deliberate rather than an error: an ordinary interactive
    turn that never interrupts does not need its state written anywhere, and
    paying for that on every message would be waste.
    """
    backend = (getattr(settings, "session_backend", "") or "file").lower()

    if backend == "none":
        return None

    if backend == "s3":
        bucket = getattr(settings, "session_s3_bucket", "")
        if not bucket:
            logger.error(
                "SESSION_BACKEND=s3 but SESSION_S3_BUCKET is unset — "
                "falling back to local files, which do not survive a deploy."
            )
        else:
            from strands.session.s3_session_manager import S3SessionManager
            return S3SessionManager(
                session_id=session_id,
                bucket=bucket,
                prefix=getattr(settings, "session_s3_prefix", "sessions/"),
            )

    from strands.session.file_session_manager import FileSessionManager

    global _warned_ephemeral
    if settings.environment == "production" and not _warned_ephemeral:
        _warned_ephemeral = True
        logger.warning(
            "Using file-based sessions in production. Render's disk is ephemeral, "
            "so any interrupt waiting on a user will be lost on the next deploy."
        )

    storage_dir = pathlib.Path(
        getattr(settings, "session_dir", "") or ".agent-sessions"
    )
    storage_dir.mkdir(parents=True, exist_ok=True)
    return FileSessionManager(session_id=session_id, storage_dir=str(storage_dir))
