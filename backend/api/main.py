"""Mini Manager FastAPI application."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from .config import settings
from .middleware.security import SecurityHeadersMiddleware
from .routers import (
    auth, classify, explain, scans, preferences, agent,
    stats, notifications, rules, profile, insights, search, journal, mfa, privacy,
    subscriptions, corrections, blocklist, conventions, support_agent, onboarding, business_agents,
    eft_payments,
)
from .services.db import close_pool, init_pool

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)


# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info("Starting up — initialising DB pool...")
    await init_pool()
    await _run_migrations()
    logger.info("DB pool ready.")
    yield
    logger.info("Shutting down — closing DB pool...")
    await close_pool()
    logger.info("Done.")


async def _run_migrations() -> None:
    """Apply pending migration files on startup (idempotent — uses IF NOT EXISTS)."""
    import pathlib
    from .services.db import get_pool
    pool = get_pool()
    migrations_dir = pathlib.Path(__file__).parent / "migrations"
    for sql_file in sorted(migrations_dir.glob("*.sql")):
        try:
            sql = sql_file.read_text()
            await pool.execute(sql)
            logger.info("Migration applied: %s", sql_file.name)
        except Exception as exc:
            logger.warning("Migration %s skipped/failed: %s", sql_file.name, exc)


# ─── App ──────────────────────────────────────────────────────────────────────

# slowapi global rate limiter (fallback for any endpoint not otherwise limited)
limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

app = FastAPI(
    title="Mini Manager API",
    version="1.0.0",
    description="AI-powered file organisation backend",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    # Disable automatic server-side error details in production
    # (override below with custom handler)
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── Middleware (order: outermost first) ──────────────────────────────────────

# Local dev origins, plus whatever FRONTEND_URL points at. For extra hosted
# origins (preview deploys, a custom domain) set EXTRA_CORS_ORIGINS to a
# comma-separated list rather than hardcoding them here — a stale hardcoded
# tunnel URL is what used to sit in this list.
_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    # The packaged desktop app serves its bundled Next build on 3333
    # (electron/main.js). Without these the installed .exe is CORS-blocked.
    "http://localhost:3333",
    "http://127.0.0.1:3333",
    settings.frontend_url,
    *[o.strip() for o in settings.extra_cors_origins.split(",") if o.strip()],
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-MFA-Code"],
    max_age=600,
)

# Security headers on every response
app.add_middleware(SecurityHeadersMiddleware)


# ─── Exception handlers ───────────────────────────────────────────────────────

@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    logger.error("422 Validation error on %s: %s", request.url.path, exc.errors())
    safe_errors = [
        {"field": ".".join(str(loc) for loc in e.get("loc", [])), "msg": e.get("msg", "")}
        for e in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": safe_errors})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("500 Unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "An internal error occurred"})


# ─── Routers ──────────────────────────────────────────────────────────────────

_PREFIX = "/api/v1"

app.include_router(auth.router,          prefix=_PREFIX)
app.include_router(classify.router,      prefix=_PREFIX)
app.include_router(explain.router,       prefix=_PREFIX)
app.include_router(scans.router,         prefix=_PREFIX)
app.include_router(preferences.router,   prefix=_PREFIX)
app.include_router(agent.router,         prefix=_PREFIX)
app.include_router(stats.router,         prefix=_PREFIX)
app.include_router(notifications.router, prefix=_PREFIX)
app.include_router(rules.router,         prefix=_PREFIX)
app.include_router(profile.router,       prefix=_PREFIX)
app.include_router(insights.router,      prefix=_PREFIX)
app.include_router(search.router,        prefix=_PREFIX)
app.include_router(journal.router,       prefix=_PREFIX)
app.include_router(mfa.router,           prefix=_PREFIX)
app.include_router(privacy.router,       prefix=_PREFIX)
app.include_router(subscriptions.router, prefix=_PREFIX)
app.include_router(eft_payments.router,  prefix=_PREFIX)
app.include_router(corrections.router,     prefix=_PREFIX)
app.include_router(blocklist.router,       prefix=_PREFIX)
app.include_router(conventions.router,     prefix=_PREFIX)
app.include_router(support_agent.router,   prefix=_PREFIX)
app.include_router(onboarding.router,      prefix=_PREFIX)
app.include_router(business_agents.router, prefix=_PREFIX)


# ─── Health check ─────────────────────────────────────────────────────────────

@app.get("/health", tags=["meta"])
async def health() -> dict[str, str]:
    return {"status": "ok", "version": app.version}
