"""
Conventions — user-stated rules that outrank AI inferences.

A rule here is no longer only about where files go. It can also set when the
agent runs, how it reports back, how cautious it is, and what it must not
touch. The compiler in `services.rules` decides which of those a sentence is;
this router is storage and lifecycle around it.

The compiled form carries its own `kind`, so no schema change was needed — the
`compiled` column has always been JSONB.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..middleware.auth import get_current_user
from ..services import rules as rules_svc
from ..services.db import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(tags=["conventions"])


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
    # Surfaced so the UI can show what a rule turned into, and say so when it
    # turned into nothing. A rule the user believes is working but which no
    # part of the system acts on is the failure this guards against.
    kind: str = "filing"
    description: str = ""
    problem: str = ""


def _out(row) -> ConventionOut:
    """One row, with its compiled form parsed and summarised."""
    compiled = row["compiled"]
    if isinstance(compiled, str):
        try:
            compiled = json.loads(compiled)      # JSONB arrives as text
        except Exception:                        # noqa: BLE001
            compiled = None
    body = compiled if isinstance(compiled, dict) else {}
    return ConventionOut(
        id=row["id"], scope=row["scope"], rule_text=row["rule_text"],
        compiled=body or None, source=row["source"], active=row["active"],
        kind=body.get("kind", "filing"),
        description=body.get("description", "") or row["rule_text"],
        problem=body.get("error", ""),
    )


@router.get("/conventions", response_model=list[ConventionOut])
async def get_conventions(user: dict = Depends(get_current_user)) -> list[ConventionOut]:
    pool = get_pool()
    rows = await pool.fetch(
        "SELECT id::text, scope, rule_text, compiled, source, active "
        "FROM conventions WHERE user_id = $1 ORDER BY created_at DESC",
        user["sub"],
    )
    return [_out(r) for r in rows]


@router.post("/conventions", response_model=ConventionOut)
async def add_convention(body: ConventionCreate,
                         user: dict = Depends(get_current_user)) -> ConventionOut:
    """
    Store a rule, compiled into whichever kind it turns out to be.

    A rule that could not be compiled is still stored — the user typed it and
    deleting their words would be rude — but it carries its error, and the
    deterministic consumers skip it. It shows in the UI as needing a rewrite
    rather than sitting in the list looking like it works.
    """
    compiled = await rules_svc.compile_rule(body.rule_text)

    pool = get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO conventions (user_id, scope, rule_text, compiled, source)
        VALUES ($1, $2, $3, $4::jsonb, $5)
        RETURNING id::text, scope, rule_text, compiled, source, active
        """,
        user["sub"], body.scope, body.rule_text[:500],
        json.dumps(compiled), body.source,
    )
    logger.info("Rule added for user %s [%s]: %s",
                user["sub"], compiled.get("kind"), body.rule_text[:60])
    return _out(row)


async def load_rules(user_id: str) -> list[dict]:
    """
    Every active rule for a user, for the deterministic consumers.

    Used by the scheduler and the mailer, which run without the agent and so
    need the compiled bodies rather than a prompt hint.
    """
    pool = get_pool()
    rows = await pool.fetch(
        "SELECT rule_text, compiled, source FROM conventions "
        "WHERE user_id = $1 AND active = true ORDER BY created_at DESC LIMIT 50",
        user_id,
    )
    return [{"rule_text": r["rule_text"], "compiled": r["compiled"],
             "source": r["source"]} for r in rows]


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
    return _out(row)


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
