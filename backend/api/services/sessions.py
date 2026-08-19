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


class SessionBackendError(RuntimeError):
    """
    The configured session store is unusable.

    Raised rather than degrading, because falling back to local files would
    pass every test and then lose interrupt state on the first deploy — with
    no error anywhere, and the only symptom being escalated runs that never
    resume.
    """


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
        # Asking for S3 and quietly getting local files is the worst outcome:
        # every test passes, and the only symptom in production is that
        # escalated runs never resume — silently, and only after a deploy.
        # So a misconfigured S3 backend is a startup failure, not a fallback.
        bucket = getattr(settings, "session_s3_bucket", "")
        if not bucket:
            raise SessionBackendError(
                "SESSION_BACKEND=s3 but SESSION_S3_BUCKET is not set. "
                "Set the bucket, or set SESSION_BACKEND=file if that is what you meant."
            )

        from strands.session.s3_session_manager import S3SessionManager

        kwargs = {
            "session_id": session_id,
            "bucket": bucket,
            "prefix": getattr(settings, "session_s3_prefix", "sessions/"),
        }
        region = getattr(settings, "session_s3_region", "")
        if region:
            kwargs["region_name"] = region

        # Build the boto3 session explicitly when credentials are configured.
        # pydantic reads .env into settings; boto3 reads os.environ. Those are
        # different places, so a local .env would otherwise leave boto3 with no
        # credentials while every other setting loaded fine.
        key = getattr(settings, "aws_access_key_id", "")
        secret = getattr(settings, "aws_secret_access_key", "")
        if key and secret:
            import boto3
            kwargs["boto_session"] = boto3.Session(
                aws_access_key_id=key,
                aws_secret_access_key=secret,
                region_name=region or None,
            )

        try:
            manager = S3SessionManager(**kwargs)
        except Exception as exc:
            raise SessionBackendError(
                f"Could not open the S3 session store (bucket {bucket!r}, "
                f"region {region or 'from environment'}): {exc}"
            ) from exc

        logger.info(
            "Agent sessions: S3 bucket %s (region %s)",
            bucket, region or "from environment",
        )
        return manager

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
