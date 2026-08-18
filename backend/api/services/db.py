"""asyncpg connection pool — Neon/Postgres."""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

import asyncpg
from asyncpg import Pool

from ..config import settings

logger = logging.getLogger(__name__)

_pool: Optional[Pool] = None


async def init_pool() -> None:
    """
    Open the connection pool, waking the database if it is asleep.

    Neon scales compute to zero after a few minutes idle. The first connection
    is supposed to wake it, but a short connect timeout gives up before the
    cold start finishes and surfaces as ConnectionRefusedError — which reads
    like the database is down rather than merely waking.

    Retrying with backoff absorbs that. It matters most exactly when it is least
    convenient: the first request after a quiet period, which is what a judge
    clicking a demo link produces.
    """
    global _pool
    attempts = 4
    delay = 2.0

    for attempt in range(1, attempts + 1):
        try:
            _pool = await asyncpg.create_pool(
                dsn=settings.database_url,
                min_size=2,
                max_size=10,
                command_timeout=30,
                timeout=20,      # allow time for a cold start, not just a handshake
                ssl="require",   # Neon requires SSL
            )
            if attempt > 1:
                logger.info("Database connected on attempt %d", attempt)
            return
        except (OSError, asyncpg.CannotConnectNowError) as exc:
            if attempt == attempts:
                logger.error("Database unreachable after %d attempts: %s", attempts, exc)
                raise
            logger.warning(
                "Database not ready (%s) — probably waking; retrying in %.0fs",
                type(exc).__name__, delay,
            )
            await asyncio.sleep(delay)
            delay *= 2


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def get_pool() -> Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialised — call init_pool() first")
    return _pool
