"""
POST /agent/v2 — the Strands agent, streaming.

Runs alongside the existing /agent route, which is untouched. Nothing points at
this yet; it exists so the tool layer can be built and proven one tool at a time
without the app ever being broken.

**Return-of-control.** The agent reasons here and the desktop app executes
anything needing local disk access. Tools read the folder digest the client
uploaded rather than walking a filesystem the server cannot reach.

**Why streaming.** `current_tool_use` events are emitted as tools actually
execute, so the client renders a trace of real work instead of steps the model
narrated. The distinction matters: the previous implementation reported success
for work that never happened.
"""

from __future__ import annotations

import json
import logging
from typing import AsyncIterator, Optional

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from strands import Agent
from strands.models.gemini import GeminiModel

from ..config import settings
from ..middleware.auth import get_current_user
from ..services.agent_tools import (
    ESCALATION_KEY,
    PREFS_KEY,
    SCAN_CONTEXT_KEY,
    apply_changes,
    check_rules,
    check_sensitive,
    classify_files,
    find_stale,
    propose_changes,
    notify_user,
    propose_changes,
    quarantine,
    query_files,
    recall_corrections,
    scan_folder,
)
from ..services.approval import ApprovalHook
from ..services.sessions import build_session_manager

logger = logging.getLogger(__name__)
router = APIRouter(tags=["agent-v2"])


_SYSTEM = """You are Mini Manager, an assistant that helps people organise their files.

You can look at the user's folders using your tools. You cannot see anything you
have not looked at, so call a tool before making any claim about what someone has.

Never invent files, folders, counts or sizes. If a tool tells you a folder is not
being watched, say so plainly and name the folders you can see instead.

When a tool gives you complete counts, use those exact numbers. Lists labelled as
samples are partial — never count them to answer "how many".

Keep replies short and plain. No markdown headings, no bullet lists unless the
user asked for a list."""


class AgentV2Request(BaseModel):
    message: str
    # The digest the desktop app uploaded. Tools read this instead of a disk.
    scan_context: Optional[dict] = None
    # Confidence thresholds. propose_changes routes on these, so they decide
    # whether a human gets interrupted — not merely how a list is filtered.
    preferences: Optional[dict] = None
    # Persists the agent so an interrupt can be answered on a later request.
    # Omit it for a one-shot turn that will never need to pause.
    session_id: Optional[str] = None


def build_agent(
    scan_context: Optional[dict],
    preferences: Optional[dict] = None,
    session_id: Optional[str] = None,
) -> Agent:
    """
    One agent per request, carrying that request's digest in agent.state.

    Per-request rather than shared because the digest belongs to one user and
    one moment; a module-level agent would leak one person's folder listing into
    another's conversation.

    The model ID comes from settings so it is never hardcoded — both providers
    have decommissioned models mid-project before.
    """
    model = GeminiModel(
        client_args={"api_key": settings.gemini_api_key},
        model_id=settings.gemini_model,
    )

    agent = Agent(
        model=model,
        system_prompt=_SYSTEM,
        tools=[
            # Tier 1 — observe. Read-only.
            scan_folder, query_files, find_stale, check_rules, recall_corrections,
            # Tier 2 — reason. Produce plans; mutate nothing.
            classify_files, check_sensitive, propose_changes,
            # Tier 3 — act. Every one enters the kernel; the hook decides
            # whether the user is asked first.
            apply_changes, quarantine, notify_user,
        ],
        hooks=[ApprovalHook()],
        session_manager=build_session_manager(session_id) if session_id else None,
        callback_handler=None,   # we consume events ourselves via stream_async
    )
    agent.state.set(SCAN_CONTEXT_KEY, scan_context or {})
    agent.state.set(PREFS_KEY, preferences or {})
    return agent


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


async def stream_agent(
    message: str,
    scan_context: Optional[dict],
    preferences: Optional[dict] = None,
    session_id: Optional[str] = None,
) -> AsyncIterator[str]:
    """
    Translate Strands events into SSE.

    Only the events a client can use are forwarded: text deltas, tool calls as
    they start, and a terminal done/error. The rest of the loop's lifecycle
    events are noise for a chat panel.
    """
    agent = build_agent(scan_context, preferences, session_id)
    seen_tools: set[str] = set()      # tool-use ids, for deduplication
    tool_names: set[str] = set()      # what actually ran, for the summary

    try:
        async for event in agent.stream_async(message):
            if "data" in event:
                yield _sse("text", {"text": event["data"]})

            tool_use = event.get("current_tool_use")
            if tool_use and tool_use.get("name"):
                key = tool_use.get("toolUseId") or tool_use["name"]
                if key not in seen_tools:
                    seen_tools.add(key)
                    tool_names.add(tool_use["name"])
                    logger.info("agent/v2 calling tool: %s", tool_use["name"])
                    yield _sse("tool", {
                        "name": tool_use["name"],
                        "input": tool_use.get("input"),
                        "id": tool_use.get("toolUseId"),
                    })

            # The agent stopping to ask is the important event, not an error.
            result = event.get("result")
            if result is not None and getattr(result, "interrupts", None):
                for interrupt in result.interrupts:
                    logger.info("agent/v2 interrupted: %s", interrupt.name)
                    yield _sse("interrupt", {
                        "id": interrupt.id,
                        "name": interrupt.name,
                        "reason": interrupt.reason,
                        "session_id": session_id,
                    })

        yield _sse("done", {"tools_called": sorted(tool_names)})

    except Exception as exc:                       # noqa: BLE001 - surfaced to the client
        logger.exception("agent/v2 failed: %s", exc)
        yield _sse("error", {"message": str(exc)})


@router.post("/agent/v2")
async def agent_v2(
    body: AgentV2Request,
    user: dict = Depends(get_current_user),
) -> StreamingResponse:
    return StreamingResponse(
        stream_agent(body.message, body.scan_context, body.preferences, body.session_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


class ResumeRequest(BaseModel):
    """Answering a question the agent stopped to ask."""
    session_id: str
    interrupt_id: str
    response: str
    scan_context: Optional[dict] = None
    preferences: Optional[dict] = None


@router.post("/agent/v2/resume")
async def agent_v2_resume(
    body: ResumeRequest,
    user: dict = Depends(get_current_user),
) -> StreamingResponse:
    """
    Continue an agent that paused for a decision.

    The agent is rebuilt from the same session_id, which restores its messages
    and the interrupt it was waiting on, then handed the user's answer. It picks
    up from the tool call it stopped at rather than starting the goal again.
    """
    return StreamingResponse(
        stream_resume(body),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def stream_resume(body: ResumeRequest) -> AsyncIterator[str]:
    agent = build_agent(body.scan_context, body.preferences, body.session_id)
    tool_names: set[str] = set()
    seen: set[str] = set()

    # The shape Strands expects when resuming: the interrupt being answered,
    # and what the human said.
    answer = [{
        "interruptResponse": {
            "interruptId": body.interrupt_id,
            "response": body.response,
        }
    }]

    try:
        async for event in agent.stream_async(answer):
            if "data" in event:
                yield _sse("text", {"text": event["data"]})

            tool_use = event.get("current_tool_use")
            if tool_use and tool_use.get("name"):
                key = tool_use.get("toolUseId") or tool_use["name"]
                if key not in seen:
                    seen.add(key)
                    tool_names.add(tool_use["name"])
                    logger.info("agent/v2 resume calling tool: %s", tool_use["name"])
                    yield _sse("tool", {
                        "name": tool_use["name"],
                        "input": tool_use.get("input"),
                        "id": tool_use.get("toolUseId"),
                    })

            result = event.get("result")
            if result is not None and getattr(result, "interrupts", None):
                for interrupt in result.interrupts:
                    yield _sse("interrupt", {
                        "id": interrupt.id,
                        "name": interrupt.name,
                        "reason": interrupt.reason,
                        "session_id": body.session_id,
                    })

        yield _sse("done", {"tools_called": sorted(tool_names), "resumed": True})

    except Exception as exc:                       # noqa: BLE001 - surfaced to the client
        logger.exception("agent/v2 resume failed: %s", exc)
        yield _sse("error", {"message": str(exc)})
