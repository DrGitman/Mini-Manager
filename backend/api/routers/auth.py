"""Auth router — signup, login, refresh, with lockout + audit logging."""

from __future__ import annotations

import logging

import urllib.parse
import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from passlib.context import CryptContext

from .._jwt import create_token, decode_token
from ..config import settings
from ..middleware.auth import get_current_user
from ..middleware.security import (
    check_lockout,
    check_rate_limit,
    clear_failed_logins,
    get_client_ip,
    log_security_event,
    record_failed_login,
)
from ..models.schemas import AuthResponse, LoginRequest, SignupRequest
from ..services.db import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ─── Signup ───────────────────────────────────────────────────────────────────

@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest, request: Request) -> AuthResponse:
    ip = get_client_ip(request)

    # Rate limit: 5 signups per IP per hour
    check_rate_limit(f"signup:{ip}", max_calls=5, window_seconds=3600,
                     detail="Too many signup attempts. Please try again later.")

    pool = get_pool()
    existing = await pool.fetchrow("SELECT id FROM users WHERE email = $1", body.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    hashed = _pwd_ctx.hash(body.password)
    row = await pool.fetchrow(
        """
        INSERT INTO users (email, name, password_hash)
        VALUES ($1, $2, $3)
        RETURNING id, email, name, plan
        """,
        body.email, body.name, hashed,
    )

    token = create_token({"sub": str(row["id"]), "email": row["email"]})

    await log_security_event(
        event_type="signup",
        user_id=str(row["id"]),
        ip=ip,
        user_agent=request.headers.get("user-agent"),
        detail={"email": row["email"]},
    )

    return AuthResponse(
        access_token=token,
        user_id=str(row["id"]),
        email=row["email"],
        name=row["name"],
        plan=row["plan"],
    )


# ─── Login ────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, request: Request) -> AuthResponse:
    ip = get_client_ip(request)

    # Rate limit: 10 login attempts per IP per minute (burst protection)
    check_rate_limit(f"login:{ip}", max_calls=10, window_seconds=60,
                     detail="Too many login attempts. Please slow down.")

    # Account lockout check (5 failures in 15 min → 30 min lock)
    await check_lockout(ip, body.email)

    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT id, email, name, plan, password_hash FROM users WHERE email = $1",
        body.email,
    )

    # Constant-time comparison prevents user enumeration
    if not row or not _pwd_ctx.verify(body.password, row["password_hash"]):
        await record_failed_login(ip, body.email)
        await log_security_event(
            event_type="login_fail",
            user_id=str(row["id"]) if row else None,
            ip=ip,
            user_agent=request.headers.get("user-agent"),
            detail={"email": body.email},
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    # Successful login — clear failure history
    await clear_failed_logins(ip, body.email)

    token = create_token({"sub": str(row["id"]), "email": row["email"]})

    await log_security_event(
        event_type="login_ok",
        user_id=str(row["id"]),
        ip=ip,
        user_agent=request.headers.get("user-agent"),
        detail={"email": row["email"]},
    )

    return AuthResponse(
        access_token=token,
        user_id=str(row["id"]),
        email=row["email"],
        name=row["name"],
        plan=row["plan"],
    )


# ─── Token refresh ────────────────────────────────────────────────────────────

@router.post("/refresh", response_model=AuthResponse)
async def refresh_token(user: dict = Depends(get_current_user)) -> AuthResponse:
    """Issue a fresh 2-hour access token for a still-valid token (silent re-auth)."""
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT id, email, name, plan FROM users WHERE id = $1",
        user["sub"],
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    token = create_token({"sub": str(row["id"]), "email": row["email"]})
    return AuthResponse(
        access_token=token,
        user_id=str(row["id"]),
        email=row["email"],
        name=row["name"],
        plan=row["plan"],
    )


# ─── Google OAuth ─────────────────────────────────────────────────────────────

_GOOGLE_AUTH_URL  = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_GOOGLE_USER_URL  = "https://www.googleapis.com/oauth2/v2/userinfo"


@router.get("/google")
async def google_login(mode: str = "web") -> RedirectResponse:
    """Redirect user to Google's OAuth consent screen."""
    if not settings.google_client_id:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")

    redirect_uri = f"{settings.api_base_url}/api/v1/auth/google/callback"
    params = urllib.parse.urlencode({
        "client_id":     settings.google_client_id,
        "redirect_uri":  redirect_uri,
        "response_type": "code",
        "scope":         "openid email profile",
        "state":         mode,
        "access_type":   "online",
    })
    return RedirectResponse(f"{_GOOGLE_AUTH_URL}?{params}")


@router.get("/google/callback")
async def google_callback(code: str, state: str = "web") -> RedirectResponse:
    """Exchange Google code for our JWT, then redirect to the right place."""
    if not settings.google_client_id:
        raise HTTPException(status_code=501, detail="Google OAuth not configured")

    redirect_uri = f"{settings.api_base_url}/api/v1/auth/google/callback"

    async with httpx.AsyncClient(timeout=10.0) as client:
        token_resp = await client.post(_GOOGLE_TOKEN_URL, data={
            "code":          code,
            "client_id":     settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri":  redirect_uri,
            "grant_type":    "authorization_code",
        })
        if not token_resp.is_success:
            raise HTTPException(status_code=400, detail="Failed to exchange Google code")
        tokens = token_resp.json()

        user_resp = await client.get(
            _GOOGLE_USER_URL,
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        if not user_resp.is_success:
            raise HTTPException(status_code=400, detail="Failed to fetch Google profile")
        guser = user_resp.json()

    email = guser.get("email", "")
    name  = guser.get("name") or email.split("@")[0]
    if not email:
        raise HTTPException(status_code=400, detail="Google did not return an email")

    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT id, email, name, plan FROM users WHERE email = $1", email
    )
    if not row:
        row = await pool.fetchrow(
            "INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name, plan",
            email, name, "",
        )

    jwt = create_token({"sub": str(row["id"]), "email": row["email"]})
    qs = urllib.parse.urlencode({
        "token":   jwt,
        "user_id": str(row["id"]),
        "email":   row["email"],
        "name":    row["name"],
        "plan":    row["plan"],
    })

    if state == "desktop":
        return RedirectResponse(f"minimanager://auth?{qs}")
    else:
        frontend = settings.frontend_url or "http://localhost:3000"
        return RedirectResponse(f"{frontend}/auth/google/callback?{qs}")
