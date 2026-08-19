"""
Autonomous runs — the agent working while nobody is watching.

This is the mode the product is actually about. The user opens the app and finds
work already done, plus a short list of things the agent wanted an opinion on.

Three rules separate this from the interactive path:

**It never blocks.** An interactive agent can pause and wait for an answer.
A scheduled one has nobody to answer it, so a question would hang the run for
ever. Escalations are recorded and the run carries on to the next folder.

**It only ever applies the `auto` set.** Anything uncertain or private is
recorded for a human. That is the same `propose_changes` routing the interactive
path uses — confidence deciding whether someone is interrupted, not merely how
a list is filtered.

**The safety layer is identical.** Every mutation still goes through the kernel,
inside the tool, unconditionally. Nothing about running unattended relaxes what
is physically permitted — if anything, it matters more here, because there is no
one to notice.

Return-of-control still applies: this produces a plan, and the desktop app
carries it out. The server cannot reach the user's disk on a schedule any more
than it can interactively.
"""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from strands import Agent
from strands.models.gemini import GeminiModel

from ..config import settings
from .agent_tools import (
    EXECUTION_PLAN_KEY,
    PREFS_KEY,
    PROPOSAL_KEY,
    SCAN_CONTEXT_KEY,
    apply_changes,
    check_rules,
    check_sensitive,
    classify_files,
    find_stale,
    propose_changes,
    query_files,
    recall_corrections,
    scan_folder,
)
from .approval import ApprovalHook

logger = logging.getLogger(__name__)


# The goal handed to the agent on a scheduled run. Written as an instruction to
# a model, like the tool docstrings — it decides the sequence, we state the
# constraints.
AUTONOMOUS_GOAL = """Tidy up the folder called {folder}.

Work out what each file is and where it belongs, then apply only the changes you
are confident about and that involve nothing private.

Anything uncertain, and anything private, must be left exactly where it is and
recorded for the user to decide. Do not apply those, and do not ask me — nobody
is available to answer right now.

When you are done, say briefly what you changed and what you left alone."""


@dataclass
class RunResult:
    """What one autonomous run did, for the journal and the summary."""
    run_id: str
    user_id: str
    trigger: str = "scheduled"
    files_seen: int = 0
    files_applied: int = 0
    escalations: list[dict] = field(default_factory=list)
    operations: list[dict] = field(default_factory=list)
    tool_calls: list[dict] = field(default_factory=list)
    folders: list[str] = field(default_factory=list)
    summary: str = ""
    status: str = "done"
    error: str = ""

    @property
    def escalation_count(self) -> int:
        return len(self.escalations)


def _build_autonomous_agent(digest: dict, prefs: dict) -> tuple[Agent, ApprovalHook]:
    """
    An agent configured to work unattended.

    The hook runs in autonomous mode so an unapproved mutation is refused and
    recorded rather than raising an interrupt nobody would ever answer. The
    kernel is untouched — it is inside the tools, not around them.
    """
    hook = ApprovalHook(mode="autonomous")

    agent = Agent(
        model=GeminiModel(
            client_args={"api_key": settings.gemini_api_key},
            model_id=settings.gemini_model,
        ),
        system_prompt=(
            "You are Mini Manager, working on a schedule while the user is away.\n\n"
            "Apply only what you are confident about and that is not private. "
            "Leave anything else untouched and say so.\n\n"
            "You cannot ask questions right now — there is nobody there. If you "
            "need a decision, record it and move on.\n\n"
            "Be brief and concrete. Say what you did and what you did not."
        ),
        tools=[
            scan_folder, query_files, find_stale, check_rules, recall_corrections,
            classify_files, check_sensitive, propose_changes,
            apply_changes,
        ],
        hooks=[hook],
        callback_handler=None,
    )
    agent.state.set(SCAN_CONTEXT_KEY, {"watched_folders": [digest]})
    agent.state.set(PREFS_KEY, prefs or {})
    return agent, hook


async def run_one_folder(digest: dict, prefs: dict, result: RunResult) -> None:
    """
    Work through one folder, recording what happened.

    Exceptions are caught per folder on purpose: one unreadable folder must not
    abandon the others, and a run that half-finished silently is worse than one
    that says which part failed.
    """
    label = digest.get("label") or digest.get("root") or "folder"
    agent, hook = _build_autonomous_agent(digest, prefs)
    started = time.monotonic()

    try:
        async for event in agent.stream_async(AUTONOMOUS_GOAL.format(folder=label)):
            tool_use = event.get("current_tool_use")
            if tool_use and tool_use.get("name"):
                call_id = tool_use.get("toolUseId") or tool_use["name"]
                if not any(c.get("id") == call_id for c in result.tool_calls):
                    result.tool_calls.append({
                        "folder": label,
                        "tool": tool_use["name"],
                        "input": tool_use.get("input"),
                        "id": call_id,
                        "at_ms": int((time.monotonic() - started) * 1000),
                    })
    except Exception as exc:                       # noqa: BLE001 - per-folder isolation
        logger.exception("autonomous run failed on %s: %s", label, exc)
        result.status = "partial"
        result.error = f"{label}: {exc}"
        return

    result.folders.append(label)
    result.files_seen += int(digest.get("total_files") or 0)

    # What the agent decided, read from state rather than from its prose — the
    # numbers must come from the data, not from what it said it did.
    proposal = agent.state.get(PROPOSAL_KEY) or {}
    for f in proposal.get("files") or []:
        if f.get("disposition") in ("review", "escalate"):
            result.escalations.append({
                "folder": label,
                "file": f.get("name"),
                "path": f.get("path"),
                "target": f.get("target_folder"),
                "reason": ("sensitive" if f.get("sensitivity", "none") != "none"
                           else "low_confidence"),
                "why": f.get("why"),
                "confidence": f.get("confidence"),
            })

    # Operations the kernel approved, for the desktop app to carry out.
    plan = agent.state.get(EXECUTION_PLAN_KEY) or {}
    ops = plan.get("operations") or []
    result.operations.extend(ops)
    result.files_applied += len(ops)

    # Anything the hook refused because it needed a person.
    for deferred in hook.deferred:
        for f in deferred.get("files") or []:
            already = any(e.get("file") == f.get("name") for e in result.escalations)
            if not already:
                result.escalations.append({
                    "folder": label,
                    "file": f.get("name"),
                    "target": f.get("target"),
                    "reason": ("sensitive" if f.get("sensitivity", "none") != "none"
                               else "needs_approval"),
                    "why": f.get("why"),
                })


async def write_summary(result: RunResult) -> str:
    """
    Ask the agent to describe its own run, in its own words.

    Deliberately not a template with numbers substituted. A person reading
    "I left your passport scan alone because I would rather you decided" trusts
    it differently to "1 file skipped (sensitivity=identity)" — and the second
    is what every other tool already says.

    Falls back to a plain sentence if the model is unavailable; a run without a
    summary is still a successful run.
    """
    facts = {
        "folders": result.folders,
        "files_seen": result.files_seen,
        "files_applied": result.files_applied,
        "left_alone": [
            {"file": e.get("file"), "reason": e.get("reason"), "why": e.get("why")}
            for e in result.escalations[:12]
        ],
        "total_left_alone": result.escalation_count,
    }

    try:
        writer = Agent(
            model=GeminiModel(
                client_args={"api_key": settings.gemini_api_key},
                model_id=settings.gemini_model,
            ),
            system_prompt=(
                "You just tidied someone's folders while they were away. Write "
                "them two or three short sentences saying what you did and what "
                "you deliberately left alone, and why.\n\n"
                "Write as yourself, to them. No headings, no bullet points, no "
                "statistics dump. If you left private files alone, say so plainly "
                "— that is the part they most want to know you handled well.\n\n"
                "Only state what is in the facts you are given."
            ),
            callback_handler=None,
        )
        reply = await writer.invoke_async(
            f"Here is what happened, as JSON:\n{facts}\n\nWrite the note."
        )
        text = str(reply).strip()
        if text:
            return text
    except Exception as exc:                       # noqa: BLE001 - summary is not the job
        logger.warning("Could not write run summary: %s", exc)

    left = result.escalation_count
    return (
        f"Tidied {', '.join(result.folders) or 'your folders'}: "
        f"{result.files_applied} file(s) organised, "
        f"{left} left for you to look at."
    )


async def run_autonomously(
    user_id: str,
    digests: list[dict],
    prefs: Optional[dict] = None,
    trigger: str = "scheduled",
    recorder: Any = None,
) -> RunResult:
    """
    One scheduled pass over every watched folder.

    `recorder` writes the run and its escalations. It is injected so the run can
    be exercised without a database — and so the persistence layer stays out of
    the reasoning layer.
    """
    result = RunResult(
        run_id=f"run-{uuid.uuid4().hex[:12]}",
        user_id=user_id,
        trigger=trigger,
    )

    logger.info("autonomous run %s starting over %d folder(s)", result.run_id, len(digests))

    for digest in digests:
        await run_one_folder(digest, prefs or {}, result)

    result.summary = await write_summary(result)

    if recorder is not None:
        try:
            await recorder.save(result)
        except Exception as exc:                   # noqa: BLE001 - the work still happened
            logger.exception("Could not record run %s: %s", result.run_id, exc)

    logger.info(
        "autonomous run %s finished: %d seen, %d applied, %d escalated",
        result.run_id, result.files_seen, result.files_applied, result.escalation_count,
    )
    return result
