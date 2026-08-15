"""Support agent — autonomous first-line support via Groq."""

from __future__ import annotations

import json
import logging
import time
from typing import Optional

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..config import settings
from ..middleware.auth import get_current_user
from ..services.db import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(tags=["support"])

_GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"
_GROQ_MODEL = settings.groq_model

_SUPPORT_SYSTEM = """\
You are the Mini Manager support agent. You handle support queries autonomously.

Mini Manager is a desktop + web AI file organiser. Key facts:
- Classifies files using AI (Groq)
- Runs on Windows desktop (Electron) and web browser
- Plans: Free (basic), Pro ($19/mo — unlimited scans, rules, priority support)
- Undo is always free, on every plan, forever
- File contents never leave the user's device — only metadata is processed
- Files are sent to Recycle Bin, never permanently deleted
- Users can add custom rules in natural language

RESPONSE RULES:
- Answer concisely and helpfully in plain English
- If the issue is a billing problem, refund request over $50, account breach, or data loss: set escalate=true
- If you cannot confidently resolve it: set escalate=true
- Never promise features that don't exist
- Tone: friendly, direct, no jargon

Return ONLY JSON:
{
  "reply": "your response to the user",
  "escalate": false,
  "category": "billing|technical|how-to|feedback|other",
  "resolved": true
}"""


class SupportRequest(BaseModel):
    message: str
    email: Optional[str] = None
    subject: Optional[str] = None


class SupportResponse(BaseModel):
    reply: str
    escalated: bool
    ticket_id: str
    category: str


@router.post("/support/chat", response_model=SupportResponse)
async def support_chat(
    body: SupportRequest,
    user: dict = Depends(get_current_user),
) -> SupportResponse:
    """Autonomous support: Groq handles the query, escalates only edge cases."""
    t_start = time.monotonic()
    user_id = user["sub"]

    # Call Groq
    ai_reply = "Sorry, I'm having trouble right now. Please email support@minimanager.app."
    escalate = True
    category = "other"
    resolved = False

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                _GROQ_URL,
                headers={"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"},
                json={
                    "model": _GROQ_MODEL,
                    "messages": [
                        {"role": "system", "content": _SUPPORT_SYSTEM},
                        {"role": "user", "content": body.message},
                    ],
                    "temperature": 0.3,
                    "response_format": {"type": "json_object"},
                },
            )
            resp.raise_for_status()
            data = json.loads(resp.json()["choices"][0]["message"]["content"])
            ai_reply = data.get("reply", ai_reply)
            escalate = bool(data.get("escalate", False))
            category = str(data.get("category", "other"))
            resolved = bool(data.get("resolved", not escalate))
    except Exception as exc:
        logger.error("Support agent Groq call failed: %s", exc)

    latency_ms = int((time.monotonic() - t_start) * 1000)
    pool = get_pool()

    # Store ticket
    row = await pool.fetchrow(
        """
        INSERT INTO support_tickets (user_id, email, subject, message, ai_reply, escalated, resolved, autonomous)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id::text
        """,
        user_id, body.email, body.subject, body.message[:2000],
        ai_reply, escalate, resolved, not escalate,
    )
    ticket_id = row["id"]

    # Log agent decision
    await pool.execute(
        """
        INSERT INTO agent_decisions
            (user_id, agent, trigger_event, input_json, model, reasoning, action_taken, autonomous, latency_ms)
        VALUES ($1, 'support', 'inbound_message', $2::jsonb, $3, $4, $5, $6, $7)
        """,
        user_id,
        json.dumps({"message_length": len(body.message), "category": category}),
        _GROQ_MODEL,
        f"Category: {category}. Resolved: {resolved}. Escalated: {escalate}.",
        f"Replied autonomously. Ticket {ticket_id}." if not escalate else f"Escalated to human. Ticket {ticket_id}.",
        not escalate,
        latency_ms,
    )

    logger.info("Support ticket %s: category=%s escalated=%s autonomous=%s", ticket_id, category, escalate, not escalate)
    return SupportResponse(reply=ai_reply, escalated=escalate, ticket_id=ticket_id, category=category)


@router.get("/support/tickets")
async def get_tickets(user: dict = Depends(get_current_user)) -> list[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT id::text, subject, message, ai_reply, escalated, resolved, autonomous, created_at
        FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20
        """,
        user["sub"],
    )
    return [dict(r) for r in rows]
