"""
Business agents — autonomous operations running on cron/triggers.
Logs every decision to agent_decisions for audit trail.

Agents:
  - license   : triggered by Paddle webhook after payment
  - marketing : daily content decisions
  - pricing   : weekly — decides which trial users get an offer
  - churn     : usage-drop detection
"""

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
router = APIRouter(tags=["business-agents"])

_GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"
_GROQ_MODEL = settings.groq_model


# ─── Shared helpers ────────────────────────────────────────────────────────────

async def _call_groq(system: str, user_msg: str, temperature: float = 0.4) -> dict:
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            _GROQ_URL,
            headers={"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"},
            json={
                "model": _GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_msg},
                ],
                "temperature": temperature,
                "response_format": {"type": "json_object"},
            },
        )
        resp.raise_for_status()
        return json.loads(resp.json()["choices"][0]["message"]["content"])


async def _log_decision(pool, user_id: Optional[str], agent: str, trigger: str,
                        input_data: dict, action: str, reasoning: str,
                        autonomous: bool, latency_ms: int) -> None:
    try:
        await pool.execute(
            """
            INSERT INTO agent_decisions
                (user_id, agent, trigger_event, input_json, model, reasoning, action_taken, autonomous, latency_ms)
            VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
            """,
            user_id, agent, trigger, json.dumps(input_data),
            _GROQ_MODEL, reasoning, action, autonomous, latency_ms,
        )
    except Exception as exc:
        logger.warning("Failed to log agent decision: %s", exc)


# ─── License agent ─────────────────────────────────────────────────────────────

_LICENSE_SYSTEM = """\
You are the Mini Manager license agent. A user just upgraded to Pro.
Write a brief, warm activation confirmation email body (plain text, no HTML).
Include: confirmation their Pro plan is active, 3 key Pro features, next steps.
Return JSON: {"subject": "...", "body": "...", "action": "send_activation_email"}"""


class LicenseActivateRequest(BaseModel):
    user_id: str
    user_name: str
    user_email: str
    plan: str = "pro"


class LicenseActivateResponse(BaseModel):
    subject: str
    body: str
    action: str
    logged: bool


@router.post("/agents/license/activate", response_model=LicenseActivateResponse)
async def license_activate(
    body: LicenseActivateRequest,
    user: dict = Depends(get_current_user),
) -> LicenseActivateResponse:
    """Called by Paddle webhook after successful payment. Agent drafts the activation email."""
    t_start = time.monotonic()
    pool = get_pool()

    result = {"subject": "Your Pro plan is active", "body": f"Hi {body.user_name},\n\nYour Mini Manager Pro plan is now active. Enjoy unlimited scans, rules, and priority support.\n\nTeam Mini Manager", "action": "send_activation_email"}
    reasoning = "Generated activation email autonomously."

    try:
        result = await _call_groq(
            _LICENSE_SYSTEM,
            f"User: {body.user_name} ({body.user_email}), Plan: {body.plan}",
        )
        reasoning = f"Drafted activation email for {body.user_email}. Subject: {result.get('subject', '')}."
    except Exception as exc:
        logger.error("License agent failed: %s", exc)

    latency_ms = int((time.monotonic() - t_start) * 1000)
    await _log_decision(pool, body.user_id, "license", "payment_confirmed",
                        {"email": body.user_email, "plan": body.plan},
                        result.get("action", "send_activation_email"), reasoning, True, latency_ms)

    # In production: send via SendGrid/Resend here
    logger.info("License agent: activation email drafted for %s (would send in production)", body.user_email)
    return LicenseActivateResponse(
        subject=result.get("subject", "Your Pro plan is active"),
        body=result.get("body", ""),
        action=result.get("action", "send_activation_email"),
        logged=True,
    )


# ─── Pricing agent ─────────────────────────────────────────────────────────────

_PRICING_SYSTEM = """\
You are the Mini Manager pricing agent. Decide whether a free-tier user should receive an upgrade offer.
Inputs: days_since_signup, total_scans, files_organised, last_active_days_ago.
Decision criteria: engaged users (≥3 scans, ≥50 files, active in last 7 days) should get an offer.
Return JSON: {"send_offer": true|false, "offer_type": "trial_extension|discount_10|discount_20|none", "reasoning": "brief"}"""


class PricingDecisionRequest(BaseModel):
    target_user_id: str
    days_since_signup: int
    total_scans: int
    files_organised: int
    last_active_days_ago: int


class PricingDecisionResponse(BaseModel):
    send_offer: bool
    offer_type: str
    reasoning: str


@router.post("/agents/pricing/decide", response_model=PricingDecisionResponse)
async def pricing_decide(
    body: PricingDecisionRequest,
    user: dict = Depends(get_current_user),
) -> PricingDecisionResponse:
    """Weekly cron: decide which free users get an upgrade offer."""
    t_start = time.monotonic()
    pool = get_pool()

    result = {"send_offer": False, "offer_type": "none", "reasoning": "Insufficient data."}
    try:
        result = await _call_groq(
            _PRICING_SYSTEM,
            json.dumps({
                "days_since_signup": body.days_since_signup,
                "total_scans": body.total_scans,
                "files_organised": body.files_organised,
                "last_active_days_ago": body.last_active_days_ago,
            }),
        )
    except Exception as exc:
        logger.error("Pricing agent failed: %s", exc)

    latency_ms = int((time.monotonic() - t_start) * 1000)
    await _log_decision(pool, body.target_user_id, "pricing", "weekly_cron",
                        {"scans": body.total_scans, "files": body.files_organised},
                        f"Offer: {result.get('offer_type', 'none')}",
                        result.get("reasoning", ""), bool(result.get("send_offer")), latency_ms)

    return PricingDecisionResponse(
        send_offer=bool(result.get("send_offer", False)),
        offer_type=str(result.get("offer_type", "none")),
        reasoning=str(result.get("reasoning", "")),
    )


# ─── Churn agent ───────────────────────────────────────────────────────────────

_CHURN_SYSTEM = """\
You are the Mini Manager churn prevention agent. A user has gone inactive.
Decide: reach out, offer help, or approve a small refund?
Return JSON: {
  "action": "send_reengagement|offer_refund|do_nothing",
  "message": "short friendly re-engagement message (if sending)",
  "reasoning": "brief"
}"""


class ChurnCheckRequest(BaseModel):
    target_user_id: str
    user_name: str
    days_inactive: int
    plan: str
    total_scans: int


class ChurnCheckResponse(BaseModel):
    action: str
    message: str
    reasoning: str


@router.post("/agents/churn/check", response_model=ChurnCheckResponse)
async def churn_check(
    body: ChurnCheckRequest,
    user: dict = Depends(get_current_user),
) -> ChurnCheckResponse:
    """Triggered when a user has been inactive for 14+ days."""
    t_start = time.monotonic()
    pool = get_pool()

    result = {"action": "do_nothing", "message": "", "reasoning": "User recently signed up."}
    try:
        result = await _call_groq(
            _CHURN_SYSTEM,
            json.dumps({
                "user_name": body.user_name,
                "days_inactive": body.days_inactive,
                "plan": body.plan,
                "total_scans": body.total_scans,
            }),
        )
    except Exception as exc:
        logger.error("Churn agent failed: %s", exc)

    latency_ms = int((time.monotonic() - t_start) * 1000)
    await _log_decision(pool, body.target_user_id, "churn", "usage_drop",
                        {"days_inactive": body.days_inactive, "plan": body.plan},
                        result.get("action", "do_nothing"),
                        result.get("reasoning", ""), result.get("action") != "do_nothing", latency_ms)

    logger.info("Churn agent: user %s inactive %dd → action=%s", body.target_user_id, body.days_inactive, result.get("action"))
    return ChurnCheckResponse(
        action=str(result.get("action", "do_nothing")),
        message=str(result.get("message", "")),
        reasoning=str(result.get("reasoning", "")),
    )


# ─── Marketing agent ───────────────────────────────────────────────────────────

_MARKETING_SYSTEM = """\
You are the Mini Manager marketing agent. Generate today's social content.
Mini Manager is an AI file organiser for desktop + web. It learns from corrections, flags sensitive files, and executes file operations via natural language chat.
Return JSON: {
  "twitter": "tweet (max 280 chars, no hashtags spam)",
  "linkedin": "LinkedIn post (2-3 sentences, professional tone)",
  "action": "post_content"
}"""


class MarketingContentResponse(BaseModel):
    twitter: str
    linkedin: str
    action: str


@router.post("/agents/marketing/daily", response_model=MarketingContentResponse)
async def marketing_daily(user: dict = Depends(get_current_user)) -> MarketingContentResponse:
    """Daily cron: generate social content autonomously."""
    t_start = time.monotonic()
    pool = get_pool()

    result = {"twitter": "", "linkedin": "", "action": "post_content"}
    try:
        result = await _call_groq(_MARKETING_SYSTEM, "Generate today's content.")
    except Exception as exc:
        logger.error("Marketing agent failed: %s", exc)

    latency_ms = int((time.monotonic() - t_start) * 1000)
    await _log_decision(pool, user["sub"], "marketing", "daily_cron", {},
                        "Generated social content autonomously.",
                        f"Twitter: {result.get('twitter', '')[:60]}…", True, latency_ms)

    return MarketingContentResponse(
        twitter=str(result.get("twitter", "")),
        linkedin=str(result.get("linkedin", "")),
        action=str(result.get("action", "post_content")),
    )
