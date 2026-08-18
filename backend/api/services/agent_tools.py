"""
Tools the Strands agent can call.

**Return-of-control.** The backend reasons; the desktop app executes anything
that needs the user's disk. So `scan_folder` does not walk a filesystem — it
reads the folder digest the desktop app uploaded with the request. The scan
already happened on the user's machine before this code ran.

Per-request data reaches a tool through `agent.state`, which Strands injects
when a tool's signature asks for `agent`. That parameter is stripped from the
schema the model sees, so the model cannot pass it or even know it exists.

**Docstrings are prompts.** The first paragraph becomes the tool description and
the Args section becomes the parameter descriptions; together they are the only
thing the model reads when deciding whether to call a tool. They are written as
instructions to a model, not as notes to a maintainer.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from strands import tool

logger = logging.getLogger(__name__)

# Key under which the route stores the uploaded digest for the tools to read.
SCAN_CONTEXT_KEY = "scan_context"


def _folders(agent: Any) -> list[dict]:
    """Every watched folder in this request's digest, or an empty list."""
    if agent is None:
        return []
    ctx = agent.state.get(SCAN_CONTEXT_KEY) or {}
    return ctx.get("watched_folders") or []


def _match(folders: list[dict], wanted: str) -> Optional[dict]:
    """
    Find the folder the user meant.

    Matches on label then full path, exact before partial, so "Downloads"
    finds the folder labelled Downloads rather than "Downloads Archive".
    """
    want = (wanted or "").strip().lower().replace("/", "\\").rstrip("\\")
    if not want:
        return folders[0] if len(folders) == 1 else None

    for f in folders:
        if (f.get("label") or "").lower() == want:
            return f
    for f in folders:
        if (f.get("root") or "").lower().replace("/", "\\").rstrip("\\") == want:
            return f
    for f in folders:
        if want in (f.get("label") or "").lower() or want in (f.get("root") or "").lower():
            return f
    return None


@tool
def scan_folder(folder_name: str, agent=None) -> dict:
    """Look at what is in one of the user's folders and return a summary of it.

    Call this whenever you need to know what files someone has before you can
    answer them — how many files there are, how much space they use, which file
    types are present, or what the largest or oldest files are. Call it before
    making any claim about the contents of a folder.

    The counts in `total_files`, `total_bytes` and `by_extension` are COMPLETE
    and exact for the whole folder. Use them for any total. The `sample_largest`
    and `sample_newest` lists are short excerpts, never a full inventory — never
    count them to answer "how many".

    If the folder you were asked about is not being watched, this returns
    `found: false` along with the folders that are available. Tell the user
    which folders you can actually see rather than guessing about the one they
    named.

    Args:
        folder_name: Which folder to look at, as the user referred to it —
            either a short name like "Downloads" or a full path like
            "C:\\Users\\sam\\Downloads". Leave empty only if the user has just
            one watched folder and clearly means that one.
    """
    folders = _folders(agent)

    if not folders:
        logger.info("scan_folder: no digest in request")
        return {
            "found": False,
            "reason": "no_folders_watched",
            "available_folders": [],
            "message": (
                "No folders are being watched yet. Tell the user to add one in "
                "Settings under Scan Scope, and do not describe any folder contents."
            ),
        }

    match = _match(folders, folder_name)
    if match is None:
        available = [f.get("label") for f in folders]
        logger.info("scan_folder: %r not watched; have %s", folder_name, available)
        return {
            "found": False,
            "reason": "folder_not_watched",
            "requested": folder_name,
            "available_folders": available,
            "message": (
                f"'{folder_name}' is not one of the watched folders. "
                f"The folders available are: {', '.join(available)}."
            ),
        }

    logger.info(
        "scan_folder: %s -> %d files",
        match.get("label"), match.get("total_files", 0),
    )

    # Shape mirrors lib/folder-digests.ts::buildDigest. Samples are passed
    # through under names that say they are partial.
    return {
        "found": True,
        "folder": match.get("label"),
        "path": match.get("root"),
        "scanned_at": match.get("scanned_at"),
        "complete_counts": {
            "total_files": match.get("total_files", 0),
            "total_bytes": match.get("total_bytes", 0),
            "by_extension": match.get("by_extension") or {},
            "unchanged_over_a_year": match.get("stale_count", 0),
            "empty_files": match.get("empty_count", 0),
        },
        "sample_largest": match.get("sample_largest") or [],
        "sample_newest": match.get("sample_newest") or [],
        "all_files": match.get("all_files"),
        "all_files_truncated": bool(match.get("all_files_truncated")),
    }
