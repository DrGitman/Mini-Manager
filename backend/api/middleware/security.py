"""
Security middleware and utilities for Mini Manager.

Provides:
  - SecurityHeadersMiddleware  — adds CSP, HSTS, X-Frame-Options, etc.
  - InMemoryRateLimiter        — sliding-window per-IP rate limiting
  - require_plan()             — RBAC dependency factory
  - log_security_event()       — structured audit log writer
  - get_client_ip()            — safely extract client IP from request
  - MAX_LOGIN_ATTEMPTS / LOCKOUT_WINDOW_MINUTES / LOCKOUT_DURATION_MINUTES
"""

from __future__ import annotations

import json
import logging
import secrets
import time
from collections import defaultdict, deque
from typing import Optional

from fastapi import Depends, HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from .._jwt import decode_token
from ..services.db import get_pool

logger = logging.getLogger(__name__)

# ─── Lockout constants ────────────────────────────────────────────────────────

MAX_LOGIN_ATTEMPTS    = 5    # failed attempts before lockout
LOCKOUT_WINDOW_MINS   = 15   # rolling window to count attempts (minutes)
LOCKOUT_DURATION_MINS = 30   # how long the lockout lasts (minutes)

# ─── Client IP helper ─────────────────────────────────────────────────────────

def get_client_ip(request: Request) -> str:
    """
    Return the real client IP, checking X-Forwarded-For first
    (set by reverse proxies / load balancers).
    """
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ─── Security headers middleware ──────────────────────────────────────────────

_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "   # Next.js needs inline + eval in dev
    "style-src 'self' 'unsafe-inline'; "                   # Tailwind inlines styles
    "img-src 'self' data: blob:; "
    "font-src 'self'; "
    "connect-src 'self' https://*.neon.tech; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self';"
)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Append security headers to every response."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"]  = "nosniff"
        response.headers["X-Frame-Options"]         = "DENY"
        response.headers["X-XSS-Protection"]        = "1; mode=block"
        response.headers["Referrer-Policy"]         = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"]      = (
            "camera=(), microphone=(), geolocation=(), payment=()"
        )
        # Only send HSTS over HTTPS; safe to include in dev too
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains; preload"
        )
        response.headers["Content-Security-Policy"] = _CSP
        # Remove server fingerprint
        try:
            del response.headers["server"]
        except KeyError:
            pass
        return response


# ─── In-memory sliding-window rate limiter ────────────────────────────────────
# For production replace with Redis (use slowapi + redis backend).
# This in-memory store is per-process and resets on restart — acceptable for MVP.

class InMemoryRateLimiter:
    """
    Sliding-window rate limiter keyed by an arbitrary string (e.g., "ip:path").
    Thread-safe enough for asyncio (single-threaded event loop).
    """

    def __init__(self) -> None:
        self._windows: dict[str, deque[float]] = defaultdict(deque)

    def is_allowed(self, key: str, max_calls: int, window_seconds: int) -> bool:
        now = time.monotonic()
        cutoff = now - window_seconds
        dq = self._windows[key]

        # Evict expired timestamps
        while dq and dq[0] < cutoff:
            dq.popleft()

        if len(dq) >= max_calls:
            return False

        dq.append(now)
        return True

    def remaining(self, key: str, max_calls: int, window_seconds: int) -> int:
        now = time.monotonic()
        cutoff = now - window_seconds
        dq = self._windows[key]
        while dq and dq[0] < cutoff:
            dq.popleft()
        return max(0, max_calls - len(dq))

    def cleanup(self) -> None:
        """Purge keys with no recent activity (call periodically)."""
        now = time.monotonic()
        stale = [k for k, dq in self._windows.items() if not dq or dq[-1] < now - 3600]
        for k in stale:
            del self._windows[k]


# Singleton limiter shared across requests
rate_limiter = InMemoryRateLimiter()


def check_rate_limit(key: str, max_calls: int, window_seconds: int, detail: str = "Too many requests") -> None:
    """Raise 429 if the rate limit is exceeded."""
    if not rate_limiter.is_allowed(key, max_calls, window_seconds):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=detail,
            headers={"Retry-After": str(window_seconds)},
        )


# ─── Account lockout ──────────────────────────────────────────────────────────

async def check_lockout(ip: str, email: str) -> None:
    """
    Raise 429 if this IP+email combo has too many recent failed login attempts.
    Recent = within LOCKOUT_WINDOW_MINS minutes.
    """
    pool = get_pool()
    count = await pool.fetchval(
        """
        SELECT COUNT(*) FROM login_attempts
        WHERE  ip = $1 AND email = $2
          AND  failed_at > NOW() - ($3 || ' minutes')::interval
        """,
        ip, email.lower(), str(LOCKOUT_WINDOW_MINS),
    )
    if count is not None and count >= MAX_LOGIN_ATTEMPTS:
        await log_security_event(
            event_type="lockout",
            user_id=None,
            ip=ip,
            detail={"email": email, "attempts": int(count)},
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Account temporarily locked after {MAX_LOGIN_ATTEMPTS} failed attempts. "
                f"Try again in {LOCKOUT_DURATION_MINS} minutes."
            ),
            headers={"Retry-After": str(LOCKOUT_DURATION_MINS * 60)},
        )


async def record_failed_login(ip: str, email: str) -> None:
    pool = get_pool()
    await pool.execute(
        "INSERT INTO login_attempts (ip, email) VALUES ($1, $2)",
        ip, email.lower(),
    )


async def clear_failed_logins(ip: str, email: str) -> None:
    pool = get_pool()
    await pool.execute(
        "DELETE FROM login_attempts WHERE ip = $1 AND email = $2",
        ip, email.lower(),
    )


# ─── Audit logging ────────────────────────────────────────────────────────────

async def log_security_event(
    event_type: str,
    user_id: Optional[str],
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
    detail: Optional[dict] = None,
) -> None:
    """Write an immutable row to audit_log. Never raises — failures are logged locally."""
    try:
        pool = get_pool()
        await pool.execute(
            """
            INSERT INTO audit_log (user_id, event_type, ip, user_agent, detail)
            VALUES ($1, $2, $3, $4, $5)
            """,
            user_id,
            event_type,
            ip,
            user_agent,
            json.dumps(detail or {}),
        )
    except Exception as exc:
        logger.error("audit_log write failed: %s", exc)


# ─── RBAC dependency factory ──────────────────────────────────────────────────

_PLAN_RANK = {"free": 0, "pro": 1, "business": 2}

def require_plan(minimum_plan: str):
    """
    FastAPI dependency factory. Usage:
        @router.get("/pro-only", dependencies=[Depends(require_plan("pro"))])
    """
    from ..middleware.auth import get_current_user  # avoid circular at module load

    async def _check(user: dict = Depends(get_current_user)) -> dict:
        user_plan = user.get("plan", "free")
        if _PLAN_RANK.get(user_plan, 0) < _PLAN_RANK.get(minimum_plan, 0):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This feature requires a {minimum_plan} plan.",
            )
        return user

    return _check


# ─── MFA check dependency ─────────────────────────────────────────────────────

async def get_current_user_with_mfa(
    request: Request,
) -> dict:
    """
    Extended auth dependency that checks MFA if it is enabled for this user.
    Pass `X-MFA-Code: 123456` header when MFA is active.
    """
    from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
    from fastapi import Depends as _Depends

    bearer = HTTPBearer(auto_error=True)
    credentials: HTTPAuthorizationCredentials = await bearer(request)
    token = credentials.credentials
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Same revocation rules as the standard dependency — a deleted account or a
    # token issued before "sign out all devices" is not valid here either.
    from .auth import _is_revoked
    if await _is_revoked(payload):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session ended. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    pool = get_pool()

    # Check if MFA is enabled and verified for this user
    mfa_row = await pool.fetchrow(
        "SELECT secret, verified FROM mfa_secrets WHERE user_id = $1",
        user_id,
    )
    if mfa_row and mfa_row["verified"]:
        import pyotp
        code = request.headers.get("x-mfa-code", "").strip()
        if not code:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="MFA code required. Send it in the X-MFA-Code header.",
            )
        totp = pyotp.TOTP(mfa_row["secret"])
        if not totp.verify(code, valid_window=1):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid MFA code.",
            )

    return payload
