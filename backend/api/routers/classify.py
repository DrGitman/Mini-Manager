"""POST /classify — batch file classification with full token optimisation pipeline."""

from __future__ import annotations

import asyncio
import logging
import time

from fastapi import APIRouter, Depends, HTTPException, status

from ..config import settings
from ..middleware.auth import get_current_user
from ..models.schemas import ClassificationResult, ClassifyRequest, ClassifyResponse
from ..services import cache as cache_svc
from ..services import gemini as gemini_svc
from ..services import heuristics as heuristics_svc
from ..services.db import get_pool
from .corrections import get_corrections_hint
from .blocklist import load_blocklist_paths
from .conventions import get_conventions_hint, check_convention_drift

logger = logging.getLogger(__name__)
router = APIRouter(tags=["classify"])

# Conservative estimate: ~40 tokens per file in batch prompt
_TOKENS_PER_FILE_ESTIMATE = 40


def _fingerprint(name: str, ext: str, size: int) -> str:
    import hashlib
    raw = f"{name.lower()}{ext.lower()}{size}"
    return hashlib.sha256(raw.encode()).hexdigest()


@router.post("/classify", response_model=ClassifyResponse)
async def classify_files(
    body: ClassifyRequest,
    user: dict = Depends(get_current_user),
) -> ClassifyResponse:
    """
    Token optimisation pipeline (in order):
    1. Heuristics pre-filter  — obvious files classified locally, 0 tokens
    2. Cache lookup           — Postgres hit = 0 tokens
    3. Budget check           — reject before spending tokens
    4. Gemini batch call      — ONE call for all remaining ambiguous files
    5. Cache store            — write AI results back to cache
    6. Token log              — recorded inside gemini_svc
    """
    user_id: str = user["sub"]
    files = body.files

    t_start = time.monotonic()

    # Load user preferences for AI prompt
    pool = get_pool()
    pref_row = await pool.fetchrow(
        "SELECT naming_style, categories, target_folder, quarantine_mode FROM user_preferences WHERE user_id = $1",
        user_id,
    )
    prefs = dict(pref_row) if pref_row else {}

    # Load memory layers in parallel
    corrections_hint, conventions_hint, blocklist_paths = await asyncio.gather(
        get_corrections_hint(user_id),
        get_conventions_hint(user_id),
        load_blocklist_paths(user_id),
        return_exceptions=False,
    )

    # ── Step 0: Idempotency — skip already-organised files ─────────────────────
    fps = [_fingerprint(f.name, f.extension, f.size) for f in files]
    applied_rows = await pool.fetch(
        "SELECT fingerprint, applied_path FROM applied_files WHERE user_id = $1 AND fingerprint = ANY($2::varchar[])",
        user_id, fps,
    )
    applied_fp_set = {r["fingerprint"] for r in applied_rows}

    already_organised: list = []
    remaining_files: list = []
    for f, fp in zip(files, fps):
        if fp in applied_fp_set:
            # File is known-organised — skip it, return a no-op result
            already_organised.append(
                ClassificationResult(
                    id=f.id, category="(organised)", new_name=f.name,
                    target_folder=f.relative_path or "", confidence=1.0,
                    reason="Already organised — skipped", source="cache", sensitivity="none",
                )
            )
        else:
            remaining_files.append(f)

    files = remaining_files  # only unorganised files go through the pipeline

    # ── Step 0.5: Blocklist — strip protected paths ────────────────────────────
    if blocklist_paths:
        files = [
            f for f in files
            if not any(
                (f.relative_path or "").lower().startswith(bp) or f.name.lower().startswith(bp)
                for bp in blocklist_paths
            )
        ]

    # ── Step 1: Heuristics pre-filter ─────────────────────────────────────────
    heuristic_results, needs_lookup = heuristics_svc.run_heuristics(files)

    # ── Step 2: Cache lookup ───────────────────────────────────────────────────
    cache_hits, needs_ai = await cache_svc.lookup_cache(needs_lookup, user_id)

    # ── Step 3: Budget check ───────────────────────────────────────────────────
    ai_results = []
    tokens_used = 0
    ai_calls = 0

    if needs_ai:
        estimated = len(needs_ai) * _TOKENS_PER_FILE_ESTIMATE
        try:
            await gemini_svc.check_budget(user_id, estimated)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=str(exc),
            )

        # ── Step 4: Groq batch call ────────────────────────────────────────────
        try:
            ai_results, usage = await gemini_svc.classify_batch(
                needs_ai, user_id, endpoint="/classify", prefs=prefs,
                existing_folders=body.existing_folders,
                corrections_hint=corrections_hint + conventions_hint,
            )
            tokens_used = usage.total
            ai_calls = 1
        except Exception as exc:
            logger.exception("Gemini classify failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"AI classification failed: {exc}",
            )

        # ── Step 5: Cache store ────────────────────────────────────────────────
        await cache_svc.store_cache_batch(needs_ai, ai_results, user_id)

    all_results = heuristic_results + cache_hits + ai_results

    # Preserve original order
    id_order = {f.id: i for i, f in enumerate(files)}
    all_results.sort(key=lambda r: id_order.get(r.id, 9999))

    # ── Folder name analysis ───────────────────────────────────────────────────
    folder_suggestions = []
    if body.existing_folders or body.root_folder_name:
        # Build file context: path → category from results
        result_map = {r.id: r for r in all_results}
        file_context = [
            {"path": f.relative_path or f.name, "category": result_map[f.id].category if f.id in result_map else ""}
            for f in files
        ]
        try:
            folder_suggestions = await gemini_svc.analyze_folders(
                root_name=body.root_folder_name,
                folder_paths=body.existing_folders,
                file_context=file_context,
                user_id=user_id,
                prefs=prefs,
            )
        except Exception as exc:
            logger.warning("Folder analysis failed (non-fatal): %s", exc)

    latency_ms = int((time.monotonic() - t_start) * 1000)

    # Log to agent_decisions for audit trail
    try:
        sensitive_count = sum(1 for r in all_results if r.sensitivity != "none")
        await pool.execute(
            """
            INSERT INTO agent_decisions
                (user_id, agent, trigger_event, input_json, model, action_taken, autonomous, latency_ms)
            VALUES ($1, 'classifier', 'scan', $2::jsonb, $3, $4, true, $5)
            """,
            user_id,
            f'{{"files": {len(files)}, "folder": "{body.root_folder_name}"}}',
            settings.groq_model,
            f"Classified {len(all_results)} files ({ai_calls} AI calls, {len(cache_hits)} cache hits, {len(heuristic_results)} heuristic). {sensitive_count} sensitive files flagged.",
            latency_ms,
        )
    except Exception as exc:
        logger.warning("Failed to log agent decision: %s", exc)

    return ClassifyResponse(
        results=all_results,
        folder_suggestions=folder_suggestions,
        tokens_used=tokens_used,
        cache_hits=len(cache_hits),
        heuristic_hits=len(heuristic_results),
        ai_calls=ai_calls,
    )
