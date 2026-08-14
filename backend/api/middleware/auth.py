"""JWT verification — FastAPI dependency."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .._jwt import decode_token
from ..services.db import get_pool

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=True)

_REVOKED_DETAIL = "Session ended. Please sign in again."


async def _is_revoked(payload: dict) -> bool:
    """
    True if the token was issued before the user's last "sign out all devices".

    Fails open: if the lookup errors (pool down, column missing on an old DB),
    we let the request through rather than locking every user out.
    """
    iat = payload.get("iat")
    user_id = payload.get("sub")
    if not iat or not user_id:
        return False
    try:
        pool = get_pool()
        row = await pool.fetchrow(
            "SELECT sessions_valid_from FROM users WHERE id = $1", user_id
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Revocation check failed, allowing request: %s", exc)
        return False
    if not row or row["sessions_valid_from"] is None:
        return False
    return iat < row["sessions_valid_from"].timestamp()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict[str, str]:
    """
    FastAPI dependency that validates a Bearer JWT and returns the payload.
    Usage: user = Depends(get_current_user)
    """
    token = credentials.credentials
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if await _is_revoked(payload):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_REVOKED_DETAIL,
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(
        HTTPBearer(auto_error=False)
    ),
) -> Optional[dict[str, str]]:
    """Like get_current_user but returns None instead of raising for unauthenticated requests."""
    if credentials is None:
        return None
    payload = decode_token(credentials.credentials)
    return payload
