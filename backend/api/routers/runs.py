"""
Autonomous runs — scheduling, execution, and what the user sees afterwards.

**Why the device asks rather than the server pushing.** Return-of-control means
the server has no way to read the user's disk. A scheduler here could decide a
run is due but could not perform one. So the desktop app asks "is anything due?"
on launch and periodically, and supplies the folder digests when it is.

That also solves the offline case for free: a machine that was switched off on
Tuesday simply asks on Thursday and gets told yes, and the summary says when the
scan actually happened rather than pretending it ran on time.

**No filesystem watcher.** Windows change notifications fire several times for a
single save, and debouncing them correctly is a day of work that buys nothing a
six-hour schedule does not already give.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..middleware.auth import get_current_user
from ..services.autonomous import RunResult, run_autonomously
from ..services.db import get_pool
from .notifications import create_notification

logger = logging.getLogger(__name__)
router = APIRouter(tags=["runs"])

# How often a scheduled run happens. Six hours is frequent enough to feel
# attentive and rare enough that a user is not forever reviewing escalations.
RUN_INTERVAL = timedelta(hours=6)


# ─── Persistence ──────────────────────────────────────────────────────────────

class RunRecorder:
    """
    Writes a finished run to Neon.

    Injected into run_autonomously rather than called from inside it, so the
    reasoning layer has no idea a database exists and can be tested without one.
    """

    async def save(self, result: RunResult) -> None:
        pool = get_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute(
                    """
                    INSERT INTO agent_runs (
                        id, user_id, trigger, goal, started_at, finished_at,
                        files_seen, files_applied, escalations, tool_calls, status
                    )
                    VALUES ($1, $2, $3, $4, NOW(), NOW(), $5, $6, $7, $8::jsonb, $9)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    result.run_id, result.user_id, result.trigger, result.summary,
                    result.files_seen, result.files_applied, result.escalation_count,
                    json.dumps(result.tool_calls), result.status,
                )

                for esc in result.escalations:
                    await conn.execute(
                        """
                        INSERT INTO escalations (
                            user_id, run_id, session_id, reason,
                            file_refs, agent_note, options, status
                        )
                        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb, 'open')
                        """,
                        result.user_id, result.run_id, result.run_id,
                        esc.get("reason", "low_confidence"),
                        json.dumps([esc]),
                        # The agent's own sentence, not the category.
                        esc.get("agent_note") or esc.get("why", ""),
                        json.dumps(["Apply it", "Leave it", "Ask me later"]),
                    )


# ─── Schemas ──────────────────────────────────────────────────────────────────

class DueResponse(BaseModel):
    due: bool
    last_run_at: Optional[str] = None
    next_run_at: Optional[str] = None
    reason: str = ""


class RunRequest(BaseModel):
    # Digests the desktop app gathered. The server cannot produce these.
    digests: list[dict]
    preferences: Optional[dict] = None
    trigger: str = "scheduled"


class ResolveRequest(BaseModel):
    """A decision on something the agent stopped over."""
    choice: str
    note: str = ""


class RunResponse(BaseModel):
    run_id: str
    summary: str
    files_seen: int
    files_applied: int
    escalations: int
    # Kernel-approved operations for the desktop app to carry out.
    operations: list[dict]
    tool_calls: list[dict]
    status: str


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/runs/due", response_model=DueResponse)
async def is_run_due(user: dict = Depends(get_current_user)) -> DueResponse:
    """
    Whether a scheduled run is owed.

    Computed from the schedule and the last run, not from a timer — a machine
    that was off for two days should come back to one run owed, not eight.
    """
    pool = get_pool()
    row = await pool.fetchrow(
        """
        SELECT started_at FROM agent_runs
        WHERE user_id = $1 AND trigger = 'scheduled'
        ORDER BY started_at DESC LIMIT 1
        """,
        user["sub"],
    )

    now = datetime.now(timezone.utc)
    if row is None:
        return DueResponse(due=True, reason="no scheduled run has happened yet")

    last = row["started_at"]
    next_due = last + RUN_INTERVAL
    return DueResponse(
        due=now >= next_due,
        last_run_at=last.isoformat(),
        next_run_at=next_due.isoformat(),
        reason=("due" if now >= next_due
                else f"next run at {next_due.isoformat()}"),
    )


@router.post("/runs", response_model=RunResponse)
async def start_run(
    body: RunRequest,
    user: dict = Depends(get_current_user),
) -> RunResponse:
    """
    Carry out one autonomous pass over the supplied folders.

    Returns the operations the kernel approved. Nothing has touched the disk
    yet — the desktop app executes them, behind its own guard.
    """
    result = await run_autonomously(
        user_id=user["sub"],
        digests=body.digests,
        prefs=body.preferences,
        trigger=body.trigger,
        recorder=RunRecorder(),
    )

    # The notification carries the agent's own words, not a count. "3 files
    # need your review" is a form field; "I left your passport scan alone — it
    # looks like an identity document" is the agent explaining itself, and that
    # is the thing worth being interrupted by.
    if result.escalation_count:
        first_note = next(
            (e.get("agent_note") for e in result.escalations if e.get("agent_note")),
            "",
        )
        await create_notification(
            user_id=user["sub"],
            kind="agent",
            title=first_note or f"{result.escalation_count} file(s) need your decision",
            body=result.summary,
        )
    elif result.files_applied:
        await create_notification(
            user_id=user["sub"],
            kind="agent",
            title=result.summary.split(".")[0][:120] or "I tidied up while you were away",
            body=result.summary,
        )

    return RunResponse(
        run_id=result.run_id,
        summary=result.summary,
        files_seen=result.files_seen,
        files_applied=result.files_applied,
        escalations=result.escalation_count,
        operations=result.operations,
        tool_calls=result.tool_calls,
        status=result.status,
    )


@router.get("/runs/latest")
async def latest_run(user: dict = Depends(get_current_user)) -> dict:
    """The most recent run, for the summary shown when the user next opens the app."""
    pool = get_pool()
    row = await pool.fetchrow(
        """
        SELECT id, trigger, goal, started_at, files_seen, files_applied,
               escalations, tool_calls, status
        FROM agent_runs WHERE user_id = $1
        ORDER BY started_at DESC LIMIT 1
        """,
        user["sub"],
    )
    if row is None:
        return {"run": None}

    open_escalations = await pool.fetchval(
        "SELECT COUNT(*) FROM escalations WHERE user_id = $1 AND status = 'open'",
        user["sub"],
    )

    return {
        "run": {
            "id": row["id"],
            "trigger": row["trigger"],
            "summary": row["goal"],
            "started_at": row["started_at"].isoformat(),
            "files_seen": row["files_seen"],
            "files_applied": row["files_applied"],
            "escalations": row["escalations"],
            "tool_calls": row["tool_calls"],
            "status": row["status"],
        },
        "open_escalations": open_escalations,
    }


@router.get("/escalations")
async def list_escalations(user: dict = Depends(get_current_user)) -> list[dict]:
    """Everything still waiting on a decision."""
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT id, run_id, reason, file_refs, agent_note, options, created_at
        FROM escalations
        WHERE user_id = $1 AND status = 'open'
        ORDER BY created_at DESC LIMIT 100
        """,
        user["sub"],
    )
    return [
        {
            "id": str(r["id"]),
            "run_id": r["run_id"],
            "reason": r["reason"],
            "files": r["file_refs"],
            "agent_note": r["agent_note"],
            "options": r["options"],
            "created_at": r["created_at"].isoformat(),
        }
        for r in rows
    ]


@router.post("/escalations/{escalation_id}/resolve")
async def resolve_escalation(
    escalation_id: str,
    body: ResolveRequest,
    user: dict = Depends(get_current_user),
) -> dict:
    """
    Record the user's decision on an escalation.

    Scoped by user_id as well as id: an escalation names files in someone's
    folders, so resolving one must never be possible from another account.

    The decision is stored rather than merely clearing the flag, because it is
    the raw material for not asking the same question twice — a correction the
    agent can learn from later.
    """
    pool = get_pool()
    updated = await pool.fetchrow(
        """
        UPDATE escalations
        SET status = 'resolved',
            resolution = $1::jsonb,
            resolved_at = NOW()
        WHERE id = $2 AND user_id = $3 AND status = 'open'
        RETURNING id, run_id, reason
        """,
        json.dumps({"choice": body.choice, "note": body.note}),
        escalation_id,
        user["sub"],
    )

    if updated is None:
        # Already answered, or not this user's to answer. Same response either
        # way — whether an id exists is not something to leak.
        return {"resolved": False, "reason": "not_open"}

    remaining = await pool.fetchval(
        "SELECT COUNT(*) FROM escalations WHERE user_id = $1 AND status = 'open'",
        user["sub"],
    )
    logger.info("escalation %s resolved as %r", escalation_id, body.choice)
    return {"resolved": True, "remaining_open": remaining}
