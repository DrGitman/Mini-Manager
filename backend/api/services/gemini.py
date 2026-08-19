"""
Hybrid AI service:
  - Groq (model from settings.groq_model) via httpx → classify_batch (batch, fast)
  - Gemini 2.0 Flash                 → explain_file    (Google Cloud requirement)
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Optional

from google import genai
from google.genai import types as genai_types
import httpx

from ..config import settings
from ..models.schemas import ClassificationResult, ExplainResponse, FileItem, FolderSuggestion, TokenUsage
from .db import get_pool

logger = logging.getLogger(__name__)

_GROQ_MODEL    = settings.groq_model
_GEMINI_MODEL  = settings.gemini_model
_GROQ_URL      = "https://api.groq.com/openai/v1/chat/completions"

# ─── Gemini client (lazy) ─────────────────────────────────────────────────────

_gemini_client: Optional[genai.Client] = None


def _get_gemini() -> genai.Client:
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = genai.Client(api_key=settings.gemini_api_key)
    return _gemini_client


# ─── Budget / logging helpers ─────────────────────────────────────────────────

async def check_budget(user_id: str, estimated_tokens: int) -> None:
    pool = get_pool()
    row = await pool.fetchrow(
        """
        SELECT monthly_token_budget, tokens_used_this_month, budget_reset_at
        FROM   users
        WHERE  id = $1
        """,
        user_id,
    )
    if not row:
        raise ValueError("User not found")

    from datetime import datetime, timezone
    if row["budget_reset_at"] <= datetime.now(timezone.utc):
        await pool.execute(
            """
            UPDATE users
            SET tokens_used_this_month = 0,
                budget_reset_at = date_trunc('month', NOW()) + INTERVAL '1 month'
            WHERE id = $1
            """,
            user_id,
        )
        return

    remaining = row["monthly_token_budget"] - row["tokens_used_this_month"]
    if remaining < estimated_tokens:
        raise ValueError(
            f"Monthly token budget exceeded. Used {row['tokens_used_this_month']} "
            f"of {row['monthly_token_budget']}. Resets at {row['budget_reset_at'].date()}."
        )


async def _deduct_tokens(user_id: Optional[str], tokens: int) -> None:
    """Accounting only — like _log_tokens, never fails the work it measured."""
    if not user_id:
        return
    try:
        pool = get_pool()
        await pool.execute(
            "UPDATE users SET tokens_used_this_month = tokens_used_this_month + $1 WHERE id = $2",
            tokens,
            user_id,
        )
    except Exception as exc:                       # noqa: BLE001 - accounting only
        logger.warning("Could not deduct tokens: %s", exc)


async def _log_tokens(
    user_id: Optional[str],
    endpoint: str,
    usage: TokenUsage,
) -> None:
    """
    Record token usage. Never let this failing break the work it measured.

    Usage logging is telemetry — if the database is unreachable, or there is no
    user to attribute it to (an agent tool calling the classifier directly),
    the classification is still perfectly good and must be returned. Losing a
    row of accounting is not a reason to fail someone's scan.
    """
    try:
        pool = get_pool()
    except RuntimeError:
        logger.debug("No database pool — skipping token log for %s", endpoint)
        return

    try:
        await _write_token_log(pool, user_id, endpoint, usage)
    except Exception as exc:                       # noqa: BLE001 - telemetry only
        logger.warning("Could not record token usage for %s: %s", endpoint, exc)


async def _write_token_log(
    pool,
    user_id: Optional[str],
    endpoint: str,
    usage: TokenUsage,
) -> None:
    await pool.execute(
        """
        INSERT INTO token_log (user_id, endpoint, model, tokens_in, tokens_out, cost_usd)
        VALUES ($1, $2, $3, $4, $5, $6)
        """,
        user_id,
        endpoint,
        usage.model,
        usage.tokens_in,
        usage.tokens_out,
        usage.cost_usd,
    )


# ─── Classify via Groq + httpx (batch) ───────────────────────────────────────

_CLASSIFY_SYSTEM = (
    "You are a file organizer. Classify files by analyzing name, extension, and size. "
    "Return ONLY a JSON object with a 'results' array — no markdown, no explanation."
)

_CLASSIFY_USER_TEMPLATE = """\
Classify these files. Return {{"results": [...]}} in the same order as input:
{files_json}{existing_hint}{prefs_hint}{corrections_hint}

Each item: {{"id":"...","category":"...","newName":"...","targetFolder":"...","confidence":0.0-1.0,"reason":"brief","sensitivity":"none"}}
Categories: Documents, Images, Videos, Audio, Code, Archives, Design, Finance, Data, Misc

FOLDER RULES (critical):
- currentPath (if present) shows where the file currently lives — use it as context.
- If a file is already inside a themed subfolder (e.g. Work/Reports/q1.pdf), keep it within that parent UNLESS it clearly belongs elsewhere.
- You may move a file globally (target a top-level folder) OR keep it organised within its current subfolder — choose whichever makes the most sense.
- If existing_folders is provided, ALWAYS prefer the most specific matching existing folder over inventing new paths.
- NEVER nest a folder inside a parent that duplicates its concept (e.g. do NOT create Images/Screenshots if Screenshots already exists).
- Only invent a new subfolder if no existing folder is a reasonable match.
- Finance: files with invoice/receipt/payment/tax in name → Finance or existing Finance folder
- Apply user naming style to newName, keep original extension
- reason: ≤10 words

SENSITIVITY RULES (set the "sensitivity" field):
- "none": regular files — most files
- "personal": medical records, therapy notes, health data, personal diaries, private photos, personal_id in name
- "financial": bank statements, tax returns, payslips, invoices, receipts, salary, account numbers (keywords: bank, statement, salary, payslip, tax_return, account, invoice, receipt, payment)
- "identity": passports, ID cards, driver's licenses, social security, credentials, passwords, certificates of identity (keywords: passport, national_id, id_copy, id_scan, drivers_license, ssn, credentials, license_copy)
High sensitivity → warn the user before moving. When in doubt → "none"."""


# Files whose whole purpose is holding credentials. The desktop app stops
# reading these at the source, but an already-installed older build still sends
# previews for them, so the content is dropped here before it can reach the AI.
_SECRET_NAME_RE = re.compile(
    r"(^\.env|\.env$|\.env\.|^id_[rd]sa|\.pem$|\.key$|\.pfx$|\.p12$"
    r"|\.keystore$|\.ppk$|credential|secret|password|\.htpasswd|\.netrc"
    r"|\.npmrc|\.pgpass)",
    re.IGNORECASE,
)


def _safe_preview(file: FileItem) -> str:
    """The file's preview, or nothing at all if the name says it holds secrets."""
    if not file.content_preview:
        return ""
    if _SECRET_NAME_RE.search(file.name or ""):
        return ""
    return file.content_preview


async def _classify_chunk(
    files: list[FileItem],
    user_id: Optional[str],
    endpoint: str = "/classify",
    prefs: Optional[dict] = None,
    existing_folders: Optional[list] = None,
    corrections_hint: str = "",
) -> tuple[list[ClassificationResult], TokenUsage]:
    """One Groq request. Callers must keep the chunk small — see classify_batch."""
    if not files:
        return [], TokenUsage()

    payload = [
        {
            "id": f.id,
            "name": f.name,
            "ext": f.extension,
            "size": f.size,
            **({"currentPath": f.relative_path} if f.relative_path else {}),
            **({"preview": _safe_preview(f)[:500]} if _safe_preview(f) else {}),
        }
        for f in files
    ]

    existing_hint = ""
    if existing_folders:
        existing_hint = f"\nexisting_folders (prefer these): {json.dumps(existing_folders)}"

    prefs_hint = ""
    if prefs:
        naming = prefs.get("naming_style", "title")
        cats = prefs.get("categories", [])
        target = prefs.get("target_folder", "")
        parts = []
        if naming and naming != "original":
            style_map = {
                "title": "Title Case",
                "camel": "camelCase",
                "kebab": "kebab-case",
                "snake": "snake_case",
            }
            parts.append(f"naming:{style_map.get(naming, naming)}")
        if cats:
            parts.append(f"preferred-categories:{','.join(cats)}")
        if target:
            parts.append(f"root-folder:{target}")
        if parts:
            prefs_hint = f"\nUser prefs: {' | '.join(parts)}"

    prompt = _CLASSIFY_USER_TEMPLATE.format(
        files_json=json.dumps(payload, separators=(",", ":")),
        existing_hint=existing_hint,
        prefs_hint=prefs_hint,
        corrections_hint=corrections_hint,
    )

    body = {
        "model": _GROQ_MODEL,
        "messages": [
            {"role": "system", "content": _CLASSIFY_SYSTEM},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            _GROQ_URL,
            headers={
                "Authorization": f"Bearer {settings.groq_api_key}",
                "Content-Type": "application/json",
            },
            json=body,
        )
        resp.raise_for_status()
        data = resp.json()

    u = data.get("usage", {})
    usage = TokenUsage(
        tokens_in=u.get("prompt_tokens", 0),
        tokens_out=u.get("completion_tokens", 0),
        model=_GROQ_MODEL,
    )

    await _log_tokens(user_id, endpoint, usage)
    await _deduct_tokens(user_id, usage.total)

    raw_text = data["choices"][0]["message"]["content"].strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    parsed = json.loads(raw_text)
    if isinstance(parsed, dict):
        raw_list = next((v for v in parsed.values() if isinstance(v, list)), [])
    else:
        raw_list = parsed

    _valid_sensitivity = {"none", "personal", "financial", "identity"}

    results: list[ClassificationResult] = []
    for item in raw_list:
        raw_sens = str(item.get("sensitivity", "none")).lower()
        sensitivity = raw_sens if raw_sens in _valid_sensitivity else "none"
        results.append(
            ClassificationResult(
                id=str(item.get("id", "")),
                category=str(item.get("category", "Misc")),
                new_name=str(item.get("newName", "")),
                target_folder=str(item.get("targetFolder", "Misc")),
                confidence=float(item.get("confidence", 0.5)),
                reason=str(item.get("reason", "")),
                source="ai",
                sensitivity=sensitivity,
            )
        )

    return results, usage


# Roughly how much serialised file JSON one request may carry. Groq rejects
# oversized requests with 413, and a Downloads folder of a few hundred files —
# each with a path and a text preview — went well past the limit, so a quick
# scan failed outright with "Failed to classify files".
_CHUNK_CHAR_BUDGET = 18_000
_MAX_FILES_PER_CHUNK = 60


async def _with_rate_limit_retry(call, attempts: int = 4):
    """
    Retry a Groq call that comes back 429.

    Splitting a scan into several requests means they arrive together and can
    trip the per-minute limit — which would fail the whole scan for a folder
    that is merely large. Groq says how long to wait in Retry-After; that is
    used when present, and a widening backoff otherwise.
    """
    for attempt in range(attempts):
        try:
            return await call()
        except httpx.HTTPStatusError as exc:
            rate_limited = exc.response is not None and exc.response.status_code == 429
            if not rate_limited or attempt == attempts - 1:
                raise
            retry_after = 0.0
            try:
                retry_after = float(exc.response.headers.get("retry-after", 0))
            except (TypeError, ValueError):
                retry_after = 0.0
            delay = retry_after if retry_after > 0 else min(2 ** attempt, 8)
            logger.warning(
                "Groq rate limit hit — waiting %.1fs before retrying (attempt %d/%d)",
                delay, attempt + 1, attempts,
            )
            await asyncio.sleep(delay)


def _split_into_chunks(files: list[FileItem]) -> list[list[FileItem]]:
    """
    Group files so each request stays under the size limit.

    Budgeted by serialised length rather than file count, because one folder of
    long Windows paths with previews weighs far more than another with short
    names, and a fixed count would still overflow on the heavy one.
    """
    chunks: list[list[FileItem]] = []
    current: list[FileItem] = []
    used = 0

    for f in files:
        cost = len(f.name) + len(f.relative_path or "") + len(_safe_preview(f)[:500]) + 80
        if current and (used + cost > _CHUNK_CHAR_BUDGET or len(current) >= _MAX_FILES_PER_CHUNK):
            chunks.append(current)
            current, used = [], 0
        current.append(f)
        used += cost

    if current:
        chunks.append(current)
    return chunks


async def classify_batch(
    files: list[FileItem],
    user_id: Optional[str],
    endpoint: str = "/classify",
    prefs: Optional[dict] = None,
    existing_folders: Optional[list] = None,
    corrections_hint: str = "",
) -> tuple[list[ClassificationResult], TokenUsage]:
    """
    Classify every file, splitting the work across as many requests as needed.

    Chunks run one at a time. Firing them together is faster but trips Groq's
    rate limit, and a 429 loses the whole scan rather than slowing it down.
    """
    if not files:
        return [], TokenUsage()

    async def run(chunk: list[FileItem], depth: int = 0) -> tuple[list[ClassificationResult], TokenUsage]:
        try:
            return await _with_rate_limit_retry(
                lambda: _classify_chunk(
                    chunk, user_id, endpoint, prefs, existing_folders, corrections_hint,
                )
            )
        except httpx.HTTPStatusError as exc:
            # Still too large despite the estimate — halve it and try again.
            # Estimates can't account for how the model counts tokens, so this
            # is the backstop that makes any folder work.
            too_large = exc.response is not None and exc.response.status_code == 413
            if not too_large or len(chunk) < 2 or depth >= 4:
                raise
            mid = len(chunk) // 2
            logger.warning(
                "Groq rejected a chunk of %d files as too large — splitting", len(chunk),
            )
            left, lu = await run(chunk[:mid], depth + 1)
            right, ru = await run(chunk[mid:], depth + 1)
            return left + right, TokenUsage(
                tokens_in=lu.tokens_in + ru.tokens_in,
                tokens_out=lu.tokens_out + ru.tokens_out,
                model=_GROQ_MODEL,
            )

    chunks = _split_into_chunks(files)
    logger.info("Classifying %d files in %d request(s)", len(files), len(chunks))

    all_results: list[ClassificationResult] = []
    total = TokenUsage(model=_GROQ_MODEL)

    for i, chunk in enumerate(chunks):
        # Space the requests slightly. Cheaper than being rate limited and
        # having to wait out a Retry-After.
        if i:
            await asyncio.sleep(0.6)
        results, usage = await run(chunk)
        all_results.extend(results)
        total.tokens_in += usage.tokens_in
        total.tokens_out += usage.tokens_out

    return all_results, total


# ─── Explain via Gemini (single file) ─────────────────────────────────────────

_EXPLAIN_SYSTEM = (
    "You are a file assistant. Explain what a file likely contains and suggest "
    "how to organize it. Be concise. Return ONLY a JSON object, no other text."
)

_EXPLAIN_USER_TEMPLATE = """\
File: {name} ({ext}, {size_kb} KB)
{preview_section}
Return JSON: {{"summary":"...","suggestedCategory":"...","suggestedName":"...","suggestedFolder":"...","confidence":0.0-1.0}}
summary: ≤30 words. suggestedName: clean, title-cased, keep extension."""


async def explain_file(
    filename: str,
    extension: str,
    size: int,
    content_preview: Optional[str],
    user_id: Optional[str],
    endpoint: str = "/explain",
) -> tuple[ExplainResponse, TokenUsage]:
    """Explain a file using Gemini 2.0 Flash (Google Cloud requirement)."""
    client = _get_gemini()

    preview_section = ""
    if content_preview:
        preview = content_preview[:1500].replace("\n", " ")
        preview_section = f'Content preview: "{preview}"\n'

    prompt = _EXPLAIN_USER_TEMPLATE.format(
        name=filename,
        ext=extension,
        size_kb=round(size / 1024, 1),
        preview_section=preview_section,
    )

    response = await asyncio.get_event_loop().run_in_executor(
        None,
        lambda: client.models.generate_content(
            model=_GEMINI_MODEL,
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                system_instruction=_EXPLAIN_SYSTEM,
                response_mime_type="application/json",
            ),
        ),
    )

    usage = TokenUsage(
        tokens_in=response.usage_metadata.prompt_token_count or 0,
        tokens_out=response.usage_metadata.candidates_token_count or 0,
        model=_GEMINI_MODEL,
    )

    await _log_tokens(user_id, endpoint, usage)
    await _deduct_tokens(user_id, usage.total)

    raw_text = response.text.strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    data: dict[str, Any] = json.loads(raw_text)

    return ExplainResponse(
        summary=str(data.get("summary", "")),
        suggested_category=str(data.get("suggestedCategory", "Misc")),
        suggested_name=str(data.get("suggestedName", filename)),
        suggested_folder=str(data.get("suggestedFolder", "Misc")),
        confidence=float(data.get("confidence", 0.5)),
        tokens_used=usage.total,
    ), usage


# ─── Folder name analysis via Groq ────────────────────────────────────────────

_FOLDER_SYSTEM = (
    "You are a file system organizer. Analyze folder names and suggest cleaner, "
    "more descriptive names based on their contents and context. "
    "Return ONLY a JSON object, no markdown or extra text."
)

_FOLDER_USER_TEMPLATE = """\
Analyze these folder names and suggest better names where needed.
Root folder name: "{root}"
All folders (relative paths): {folders_json}
Sample file context (name→category): {sample_json}{prefs_hint}

Rules:
- Only suggest a rename if the current name is genuinely unclear, messy, or abbreviated (e.g. "tmp", "asdf", "stuff", "new folder", "misc")
- Good names (e.g. "Work", "Downloads", "Projects/2024") should NOT be included in suggestions
- suggested_name is ONLY the new name for the final segment — do NOT include parent path segments
- Keep suggested names concise (1-3 words), title-cased unless prefs say otherwise
- reason: ≤12 words

Return: {{"suggestions": [{{"original": "path/to/folder", "suggested_name": "Better Name", "reason": "brief reason", "confidence": 0.0-1.0}}]}}
If no folders need renaming, return {{"suggestions": []}}"""


async def analyze_folders(
    root_name: str,
    folder_paths: list[str],
    file_context: list[dict],
    user_id: Optional[str],
    prefs: Optional[dict] = None,
) -> list[FolderSuggestion]:
    """Analyze folder names and suggest renames via Groq."""
    if not folder_paths and not root_name:
        return []

    # Build a sample of file→category pairs (max 30 to keep prompt lean)
    sample = file_context[:30]
    sample_json = json.dumps(
        [{"path": f.get("path", ""), "category": f.get("category", "")} for f in sample],
        separators=(",", ":"),
    )

    all_folders = [root_name] + folder_paths if root_name else folder_paths

    prefs_hint = ""
    if prefs:
        naming = prefs.get("naming_style", "title")
        style_map = {"title": "Title Case", "camel": "camelCase", "kebab": "kebab-case", "snake": "snake_case"}
        if naming and naming != "original":
            prefs_hint = f"\nNaming style: {style_map.get(naming, naming)}"

    prompt = _FOLDER_USER_TEMPLATE.format(
        root=root_name or "(unnamed)",
        folders_json=json.dumps(folder_paths[:100], separators=(",", ":")),
        sample_json=sample_json,
        prefs_hint=prefs_hint,
    )

    body = {
        "model": _GROQ_MODEL,
        "messages": [
            {"role": "system", "content": _FOLDER_SYSTEM},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.15,
        "response_format": {"type": "json_object"},
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(
            _GROQ_URL,
            headers={
                "Authorization": f"Bearer {settings.groq_api_key}",
                "Content-Type": "application/json",
            },
            json=body,
        )
        resp.raise_for_status()
        data = resp.json()

    u = data.get("usage", {})
    usage = TokenUsage(
        tokens_in=u.get("prompt_tokens", 0),
        tokens_out=u.get("completion_tokens", 0),
        model=_GROQ_MODEL,
    )
    await _log_tokens(user_id, "/classify/folders", usage)
    await _deduct_tokens(user_id, usage.total)

    raw_text = data["choices"][0]["message"]["content"].strip()
    if raw_text.startswith("```"):
        raw_text = raw_text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    parsed = json.loads(raw_text)
    raw_list = parsed.get("suggestions", [])

    suggestions: list[FolderSuggestion] = []
    for item in raw_list:
        original = str(item.get("original", ""))
        suggested_name = str(item.get("suggested_name", ""))
        if not original or not suggested_name:
            continue
        # Rebuild the full suggested path: same parent, new last segment
        if "/" in original:
            parent = original.rsplit("/", 1)[0]
            suggested_path = f"{parent}/{suggested_name}"
        else:
            suggested_path = suggested_name  # root or top-level folder

        suggestions.append(
            FolderSuggestion(
                original_path=original,
                suggested_name=suggested_name,
                suggested_path=suggested_path,
                reason=str(item.get("reason", "")),
                confidence=float(item.get("confidence", 0.7)),
            )
        )

    return suggestions
