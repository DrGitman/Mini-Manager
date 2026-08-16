"""CRUD + AI compilation for user-defined file organisation rules."""
from __future__ import annotations

import json
import logging
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional

from ..config import settings
from ..middleware.auth import get_current_user
from ..services.db import get_pool
from ..services import gemini as gemini_svc

logger = logging.getLogger(__name__)
router = APIRouter(tags=["rules"])

# ─── Auto-migrate ─────────────────────────────────────────────────────────────

_MIGRATE = """
CREATE TABLE IF NOT EXISTS user_rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL,
    natural_text        TEXT NOT NULL,
    target_folder       TEXT NOT NULL DEFAULT 'Documents/General',
    match_extensions    TEXT[] NOT NULL DEFAULT '{}',
    match_name_contains TEXT[] NOT NULL DEFAULT '{}',
    older_than_days     INT,
    larger_than_mb      FLOAT,
    enabled             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

_migrated = False

async def _ensure_table():
    global _migrated
    if _migrated:
        return
    pool = get_pool()
    await pool.execute(_MIGRATE)
    _migrated = True


# ─── Schemas ──────────────────────────────────────────────────────────────────

class RuleOut(BaseModel):
    id: str
    natural_text: str
    target_folder: str
    match_extensions: List[str]
    match_name_contains: List[str]
    older_than_days: Optional[int]
    larger_than_mb: Optional[float]
    enabled: bool
    created_at: str

class CreateRuleRequest(BaseModel):
    natural_text: str
    target_folder: str
    match_extensions: List[str] = []
    match_name_contains: List[str] = []
    older_than_days: Optional[int] = None
    larger_than_mb: Optional[float] = None

class CompileRequest(BaseModel):
    text: str

class CompileResponse(BaseModel):
    target_folder: str
    match_extensions: List[str]
    match_name_contains: List[str]
    older_than_days: Optional[int]
    larger_than_mb: Optional[float]
    preview: str
    corrected_input: Optional[str] = None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _row_to_out(row) -> RuleOut:
    return RuleOut(
        id=str(row["id"]),
        natural_text=row["natural_text"],
        target_folder=row["target_folder"],
        match_extensions=list(row["match_extensions"] or []),
        match_name_contains=list(row["match_name_contains"] or []),
        older_than_days=row["older_than_days"],
        larger_than_mb=row["larger_than_mb"],
        enabled=row["enabled"],
        created_at=row["created_at"].isoformat(),
    )


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/rules", response_model=List[RuleOut])
async def get_rules(user: dict = Depends(get_current_user)):
    await _ensure_table()
    pool = get_pool()
    rows = await pool.fetch(
        "SELECT * FROM user_rules WHERE user_id = $1 ORDER BY created_at DESC",
        user["sub"],
    )
    return [_row_to_out(r) for r in rows]


@router.post("/rules", response_model=RuleOut)
async def create_rule(body: CreateRuleRequest, user: dict = Depends(get_current_user)):
    await _ensure_table()
    pool = get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO user_rules
            (user_id, natural_text, target_folder, match_extensions,
             match_name_contains, older_than_days, larger_than_mb)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        """,
        user["sub"], body.natural_text, body.target_folder,
        body.match_extensions, body.match_name_contains,
        body.older_than_days, body.larger_than_mb,
    )
    return _row_to_out(row)


@router.patch("/rules/{rule_id}/toggle", response_model=RuleOut)
async def toggle_rule(rule_id: str, user: dict = Depends(get_current_user)):
    await _ensure_table()
    pool = get_pool()
    row = await pool.fetchrow(
        """
        UPDATE user_rules SET enabled = NOT enabled
        WHERE id = $1 AND user_id = $2 RETURNING *
        """,
        uuid.UUID(rule_id), user["sub"],
    )
    if not row:
        raise HTTPException(404, "Rule not found")
    return _row_to_out(row)


@router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: str, user: dict = Depends(get_current_user)):
    await _ensure_table()
    pool = get_pool()
    await pool.execute(
        "DELETE FROM user_rules WHERE id = $1 AND user_id = $2",
        uuid.UUID(rule_id), user["sub"],
    )
    return {"ok": True}


@router.post("/rules/compile", response_model=CompileResponse)
async def compile_rule(body: CompileRequest, user: dict = Depends(get_current_user)):
    """Use Gemini to parse natural-language rule into structured form."""
    prompt = f"""You are a file organisation assistant. Do TWO things in order:

1. CORRECT any spelling or grammar mistakes in the rule below. If the rule is already correct, keep it exactly as-is.
2. Parse the (corrected) rule into a JSON object.

Original rule: "{body.text}"

Return ONLY a valid JSON object with these exact fields:
{{
  "corrected_input": "the spelling-corrected version of the rule, or null if no changes needed",
  "target_folder": "Category/Subfolder",
  "match_extensions": [".pdf"],
  "match_name_contains": ["invoice"],
  "older_than_days": null,
  "larger_than_mb": null,
  "preview": "one-line summary of what the rule does"
}}

Guidelines:
- corrected_input: the spell-and-grammar-corrected rule text. Set to null if the original had no errors.
- target_folder: slash-separated path like "Documents/Finance", "Images/Screenshots", "Archives/Large", "Videos", "Audio", "Code"
- match_extensions: file extensions with dot e.g. [".pdf", ".docx"]. Empty array [] if not specified.
- match_name_contains: lowercase substrings to find in filename. Empty array [] if not specified.
- older_than_days: integer if rule mentions age ("older than 30 days" → 30), null otherwise.
- larger_than_mb: float if rule mentions size ("larger than 100MB" → 100.0), null otherwise.
- preview: a short human-readable sentence describing what the rule does.

Return ONLY the JSON, no markdown fences, no extra text."""

    try:
        client = gemini_svc._get_gemini()
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
        )
        text = response.text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])
        data = json.loads(text.strip())
        corrected = data.get("corrected_input") or None
        # Only flag as corrected if it's meaningfully different
        if corrected and corrected.strip().lower() == body.text.strip().lower():
            corrected = None
        return CompileResponse(
            target_folder=data.get("target_folder", "Documents/General"),
            match_extensions=data.get("match_extensions", []),
            match_name_contains=data.get("match_name_contains", []),
            older_than_days=data.get("older_than_days"),
            larger_than_mb=data.get("larger_than_mb"),
            preview=data.get("preview", body.text),
            corrected_input=corrected,
        )
    except Exception as e:
        logger.warning("Rule compile failed: %s", e)
        return CompileResponse(
            target_folder="Documents/General",
            match_extensions=[],
            match_name_contains=[],
            older_than_days=None,
            larger_than_mb=None,
            preview=body.text,
            corrected_input=None,
        )
