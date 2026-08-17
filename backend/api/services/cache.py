"""
Classification cache — before calling Gemini, check Postgres for a prior result.

Fingerprint: sha256(lower(filename) + lower(extension) + str(size_bytes))
"""

from __future__ import annotations

import hashlib

from ..models.schemas import ClassificationResult, FileItem
from .db import get_pool
from .heuristics import detect_sensitivity


def _fingerprint(file: FileItem) -> str:
    raw = f"{file.name.lower()}{file.extension.lower()}{file.size}"
    return hashlib.sha256(raw.encode()).hexdigest()


async def lookup_cache(files: list[FileItem], user_id: str) -> tuple[
    list[ClassificationResult],   # cache hits
    list[FileItem],               # misses
]:
    """
    Batch-checks the classification_cache table for THIS user.

    The user_id is required, not optional. Without it in the WHERE clause the
    cache is global, and a shared row hands one account the category and target
    folder another account's files were given — a target folder is frequently
    named after a client or project.
    """
    if not files:
        return [], []

    fp_to_file: dict[str, FileItem] = {_fingerprint(f): f for f in files}
    fingerprints = list(fp_to_file.keys())

    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT fingerprint, category, new_name, target_folder, confidence, source
        FROM   classification_cache
        WHERE  user_id = $1
          AND  fingerprint = ANY($2::varchar[])
        """,
        user_id,
        fingerprints,
    )

    hit_fps: set[str] = set()
    hits: list[ClassificationResult] = []

    for row in rows:
        fp = row["fingerprint"]
        file = fp_to_file[fp]

        # The cache table stores no sensitivity column, so a cache hit used to
        # come back as sensitivity="none" — permanently unflagging anything
        # sensitive that had been scanned once. Treat sensitive files as misses
        # so they always get a fresh AI review, same as the heuristic path.
        if detect_sensitivity(file.name) != "none":
            continue

        hit_fps.add(fp)
        hits.append(
            ClassificationResult(
                id=file.id,
                category=row["category"],
                new_name=row["new_name"],
                target_folder=row["target_folder"],
                confidence=row["confidence"],
                reason="Matched from classification cache",
                source="cache",
            )
        )

    misses = [f for fp, f in fp_to_file.items() if fp not in hit_fps]
    return hits, misses


async def store_cache(file: FileItem, result: ClassificationResult, user_id: str) -> None:
    """Upsert a single classification result into this user's cache."""
    fp = _fingerprint(file)
    pool = get_pool()
    await pool.execute(
        """
        INSERT INTO classification_cache
            (user_id, fingerprint, filename, extension, category, new_name, target_folder, confidence, source)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (user_id, fingerprint) DO UPDATE SET
            category      = EXCLUDED.category,
            new_name      = EXCLUDED.new_name,
            target_folder = EXCLUDED.target_folder,
            confidence    = EXCLUDED.confidence,
            source        = EXCLUDED.source,
            created_at    = NOW()
        """,
        user_id,
        fp,
        file.name,
        file.extension,
        result.category,
        result.new_name,
        result.target_folder,
        result.confidence,
        result.source,
    )


async def store_cache_batch(
    files: list[FileItem],
    results: list[ClassificationResult],
    user_id: str,
) -> None:
    """Bulk upsert all AI results into this user's cache."""
    if not files or not results:
        return

    id_to_file: dict[str, FileItem] = {f.id: f for f in files}

    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            for result in results:
                if result.id in id_to_file:
                    await store_cache(id_to_file[result.id], result, user_id)
