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
    PREFS_KEY,
    SCAN_CONTEXT_KEY,
    check_rules,
    check_sensitive,
    classify_files,
    find_stale,
    propose_changes,
    query_files,
    recall_corrections,
    scan_folder,
)

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


def build_agent(scan_context: Optional[dict], preferences: Optional[dict] = None) -> Agent:
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
        ],
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
) -> AsyncIterator[str]:
    """
    Translate Strands events into SSE.

    Only the events a client can use are forwarded: text deltas, tool calls as
    they start, and a terminal done/error. The rest of the loop's lifecycle
    events are noise for a chat panel.
    """
    agent = build_agent(scan_context, preferences)
    seen_tools: set[str] = set()

    try:
        async for event in agent.stream_async(message):
            if "data" in event:
                yield _sse("text", {"text": event["data"]})

            tool_use = event.get("current_tool_use")
            if tool_use and tool_use.get("name"):
                key = tool_use.get("toolUseId") or tool_use["name"]
                if key not in seen_tools:
                    seen_tools.add(key)
                    logger.info("agent/v2 calling tool: %s", tool_use["name"])
                    yield _sse("tool", {
                        "name": tool_use["name"],
                        "input": tool_use.get("input"),
                        "id": tool_use.get("toolUseId"),
                    })

        yield _sse("done", {"tools_called": sorted(seen_tools)})

    except Exception as exc:                       # noqa: BLE001 - surfaced to the client
        logger.exception("agent/v2 failed: %s", exc)
        yield _sse("error", {"message": str(exc)})


@router.post("/agent/v2")
async def agent_v2(
    body: AgentV2Request,
    user: dict = Depends(get_current_user),
) -> StreamingResponse:
    return StreamingResponse(
        stream_agent(body.message, body.scan_context, body.preferences),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
