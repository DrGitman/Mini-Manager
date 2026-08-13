"""Onboarding agent — analyzes first scan to infer naming conventions."""

from __future__ import annotations

import json
import logging
import time

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..config import settings
from ..middleware.auth import get_current_user
from ..services.db import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(tags=["onboarding"])

_GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"
_GROQ_MODEL = "llama-3.3-70b-versatile"

_ONBOARD_SYSTEM = """\
You are an onboarding agent for Mini Manager, an AI file organiser.
Analyse the user's existing file names and infer:
1. Their naming convention (snake_case, camelCase, Title Case, date-prefixed, etc.)
2. Their folder structure philosophy (flat vs deeply nested, by type vs by project, etc.)
3. 2–4 specific organisation rules that are clearly already in use

Return ONLY JSON:
{
  "naming_style": "title|snake|camel|kebab|date-prefix|mixed",
  "structure_style": "by-type|by-project|by-date|flat|mixed",
  "detected_conventions": [
    {"rule_text": "natural language rule", "confidence": 0.0-1.0}
  ],
  "summary": "2-sentence plain English description of how this user organises files"
}"""


class OnboardRequest(BaseModel):
    file_names: list[str]   # sample of filenames from first scan (max 100)
    folder_paths: list[str] # sample of folder structure


class OnboardResponse(BaseModel):
    naming_style: str
    structure_style: str
    detected_conventions: list[dict]
    summary: str
    conventions_saved: int


@router.post("/onboarding/analyze", response_model=OnboardResponse)
async def analyze_onboarding(
    body: OnboardRequest,
    user: dict = Depends(get_current_user),
) -> OnboardResponse:
    """
    Called after first scan. Infers the user's existing conventions
    and saves them as 'inferred' conventions (lower priority than stated ones).
    """
    t_start = time.monotonic()
    user_id = user["sub"]

    # Sample to keep prompt lean
    sample_files = body.file_names[:60]
    sample_folders = body.folder_paths[:20]

    result: dict = {
        "naming_style": "mixed",
        "structure_style": "mixed",
        "detected_conventions": [],
        "summary": "Could not analyze your file structure automatically.",
    }

    try:
        prompt = (
            f"Files: {json.dumps(sample_files)}\n"
            f"Folders: {json.dumps(sample_folders)}"
        )
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                _GROQ_URL,
                headers={"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"},
                json={
                    "model": _GROQ_MODEL,
                    "messages": [
                        {"role": "system", "content": _ONBOARD_SYSTEM},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.2,
                    "response_format": {"type": "json_object"},
                },
            )
            resp.raise_for_status()
            result = json.loads(resp.json()["choices"][0]["message"]["content"])
    except Exception as exc:
        logger.error("Onboarding analysis failed: %s", exc)

    # Save inferred conventions (only high-confidence ones)
    pool = get_pool()
    saved = 0
    for conv in result.get("detected_conventions", []):
        if float(conv.get("confidence", 0)) >= 0.75 and conv.get("rule_text"):
            try:
                await pool.execute(
                    """
                    INSERT INTO conventions (user_id, rule_text, source, scope)
                    VALUES ($1, $2, 'inferred', 'global')
                    ON CONFLICT DO NOTHING
                    """,
                    user_id, conv["rule_text"][:500],
                )
                saved += 1
            except Exception:
                pass

    # Update preferences with detected naming style
    naming_map = {"title": "title", "snake": "snake", "camel": "camel", "kebab": "kebab"}
    detected_style = naming_map.get(result.get("naming_style", ""), None)
    if detected_style:
        try:
            await pool.execute(
                "UPDATE user_preferences SET naming_style = $1 WHERE user_id = $2",
                detected_style, user_id,
            )
        except Exception:
            pass

    latency_ms = int((time.monotonic() - t_start) * 1000)
    await pool.execute(
        """
        INSERT INTO agent_decisions
            (user_id, agent, trigger_event, input_json, model, action_taken, autonomous, latency_ms)
        VALUES ($1, 'onboarding', 'first_scan', $2::jsonb, $3, $4, true, $5)
        """,
        user_id,
        json.dumps({"files_analyzed": len(sample_files), "conventions_saved": saved}),
        _GROQ_MODEL,
        f"Inferred naming style '{result.get('naming_style')}', saved {saved} conventions.",
        latency_ms,
    )

    logger.info("Onboarding: user %s — style=%s saved=%d", user_id, result.get("naming_style"), saved)
    return OnboardResponse(
        naming_style=result.get("naming_style", "mixed"),
        structure_style=result.get("structure_style", "mixed"),
        detected_conventions=result.get("detected_conventions", []),
        summary=result.get("summary", ""),
        conventions_saved=saved,
    )
