"""asyncpg connection pool — Neon/Postgres."""

from __future__ import annotations

from typing import Optional
import asyncpg
from asyncpg import Pool

from ..config import settings

_pool: Optional[Pool] = None


async def init_pool() -> None:
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=settings.database_url,
        min_size=2,
        max_size=10,
        command_timeout=30,
        ssl="require",  # Neon requires SSL
    )


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def get_pool() -> Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialised — call init_pool() first")
    return _pool
