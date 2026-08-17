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
    True if this token must no longer be accepted.

    Two reasons: the account no longer exists, or the token predates the user's
    last "sign out all devices".

    Fails open only on a genuine lookup *error* (pool down, column missing on an
    old DB), so a database blip does not lock every user out. A row that is
    simply absent is not an error — it is a deleted account, and the token dies
    with it. Treating that as "not revoked" let a deleted account keep using the
    API until its token happened to expire.
    """
    iat = payload.get("iat")
    user_id = payload.get("sub")
    if not user_id:
        return False
    try:
        pool = get_pool()
        row = await pool.fetchrow(
            "SELECT sessions_valid_from FROM users WHERE id = $1", user_id
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Revocation check failed, allowing request: %s", exc)
        return False

    if row is None:
        logger.info("Rejecting token for deleted account %s", user_id)
        return True

    if not iat or row["sessions_valid_from"] is None:
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
