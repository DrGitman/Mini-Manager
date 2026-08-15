"""Conventions — user-stated rules that outrank AI inferences."""

from __future__ import annotations

import json
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..config import settings
from ..middleware.auth import get_current_user
from ..services.db import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(tags=["conventions"])

_GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions"
_GROQ_MODEL = settings.groq_model

_COMPILE_SYSTEM = """\
You compile a user's natural-language file organisation rule into a structured JSON object.
Return ONLY a JSON object — no markdown, no explanation.
Schema: {
  "pattern": {
    "name_contains": ["word1", "word2"],   // optional keywords in filename
    "extensions": [".pdf", ".docx"],       // optional file extensions
    "folder_contains": "client work"       // optional parent folder keyword
  },
  "action": {
    "target_folder": "Clients/ACME/2026",  // where to put matching files
    "rename_pattern": null                  // optional rename template, null if not specified
  },
  "description": "one-sentence plain English summary of what this rule does"
}"""


class ConventionCreate(BaseModel):
    rule_text: str
    scope: str = "global"
    source: str = "stated"  # 'stated' | 'inferred' | 'corrected'


class ConventionOut(BaseModel):
    id: str
    scope: str
    rule_text: str
    compiled: Optional[dict] = None
    source: str
    active: bool


@router.get("/conventions", response_model=list[ConventionOut])
async def get_conventions(user: dict = Depends(get_current_user)) -> list[ConventionOut]:
    pool = get_pool()
    rows = await pool.fetch(
        "SELECT id::text, scope, rule_text, compiled, source, active FROM conventions WHERE user_id = $1 ORDER BY created_at DESC",
        user["sub"],
    )
    return [ConventionOut(
        id=r["id"], scope=r["scope"], rule_text=r["rule_text"],
        compiled=r["compiled"], source=r["source"], active=r["active"],
    ) for r in rows]


@router.post("/conventions", response_model=ConventionOut)
async def add_convention(body: ConventionCreate, user: dict = Depends(get_current_user)) -> ConventionOut:
    # Compile natural language → structured rule via Groq
    compiled: Optional[dict] = None
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                _GROQ_URL,
                headers={"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"},
                json={
                    "model": _GROQ_MODEL,
                    "messages": [
                        {"role": "system", "content": _COMPILE_SYSTEM},
                        {"role": "user", "content": f'Rule: "{body.rule_text}"'},
                    ],
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"},
                },
            )
            resp.raise_for_status()
            compiled = json.loads(resp.json()["choices"][0]["message"]["content"])
    except Exception as exc:
        logger.warning("Convention compile failed (saving raw): %s", exc)

    pool = get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO conventions (user_id, scope, rule_text, compiled, source)
        VALUES ($1, $2, $3, $4::jsonb, $5)
        RETURNING id::text, scope, rule_text, compiled, source, active
        """,
        user["sub"], body.scope, body.rule_text[:500],
        json.dumps(compiled) if compiled else None,
        body.source,
    )
    logger.info("Convention added for user %s: %s", user["sub"], body.rule_text[:60])
    return ConventionOut(
        id=row["id"], scope=row["scope"], rule_text=row["rule_text"],
        compiled=row["compiled"], source=row["source"], active=row["active"],
    )


@router.patch("/conventions/{conv_id}/toggle", response_model=ConventionOut)
async def toggle_convention(conv_id: str, user: dict = Depends(get_current_user)) -> ConventionOut:
    pool = get_pool()
    row = await pool.fetchrow(
        """
        UPDATE conventions SET active = NOT active
        WHERE id = $1 AND user_id = $2
        RETURNING id::text, scope, rule_text, compiled, source, active
        """,
        conv_id, user["sub"],
    )
    return ConventionOut(
        id=row["id"], scope=row["scope"], rule_text=row["rule_text"],
        compiled=row["compiled"], source=row["source"], active=row["active"],
    )


@router.delete("/conventions/{conv_id}", status_code=200)
async def delete_convention(conv_id: str, user: dict = Depends(get_current_user)) -> dict:
    pool = get_pool()
    await pool.execute("DELETE FROM conventions WHERE id = $1 AND user_id = $2", conv_id, user["sub"])
    return {"ok": True}


async def get_conventions_hint(user_id: str) -> str:
    """Load active conventions and format as a prompt hint. Stated rules outrank inferred."""
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT rule_text, compiled, source FROM conventions
        WHERE user_id = $1 AND active = true
        ORDER BY CASE source WHEN 'stated' THEN 0 WHEN 'corrected' THEN 1 ELSE 2 END, created_at DESC
        LIMIT 15
        """,
        user_id,
    )
    if not rows:
        return ""

    lines = ["\nUSER CONVENTIONS (treat these as absolute rules — stated rules outrank everything):"]
    for r in rows:
        source_tag = f"[{r['source']}]"
        if r["compiled"] and isinstance(r["compiled"], dict):
            action = r["compiled"].get("action", {})
            target = action.get("target_folder", "")
            desc = r["compiled"].get("description", r["rule_text"])
            lines.append(f"- {source_tag} {desc}" + (f" → {target}" if target else ""))
        else:
            lines.append(f"- {source_tag} {r['rule_text']}")
    return "\n".join(lines)


async def check_convention_drift(user_id: str) -> Optional[str]:
    """
    If the user has corrected the same AI pattern 3+ times in the past week,
    return a drift message suggesting they create a convention.
    """
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT proposed, COUNT(*) as cnt
        FROM corrections
        WHERE user_id = $1
          AND field = 'target_folder'
          AND created_at > NOW() - INTERVAL '7 days'
        GROUP BY proposed
        HAVING COUNT(*) >= 3
        ORDER BY cnt DESC
        LIMIT 1
        """,
        user_id,
    )
    if not rows:
        return None
    r = rows[0]
    return (
        f"You've overridden my suggestion to move files to '{r['proposed']}' "
        f"{r['cnt']} times this week. Want to create a convention so I stop suggesting it?"
    )
