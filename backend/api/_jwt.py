"""JWT encode/decode helpers (PyJWT)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

from .config import settings

_ALGORITHM = "HS256"
_ACCESS_EXPIRY_HOURS = 2
_REFRESH_EXPIRY_DAYS = 14


def create_token(payload: dict[str, Any], expiry_hours: int = _ACCESS_EXPIRY_HOURS) -> str:
    data = payload.copy()
    data["exp"] = datetime.now(timezone.utc) + timedelta(hours=expiry_hours)
    data["iat"] = datetime.now(timezone.utc)
    return jwt.encode(data, settings.jwt_secret, algorithm=_ALGORITHM)


def create_refresh_token(payload: dict[str, Any]) -> str:
    data = payload.copy()
    data["token_type"] = "refresh"
    data["exp"] = datetime.now(timezone.utc) + timedelta(days=_REFRESH_EXPIRY_DAYS)
    data["iat"] = datetime.now(timezone.utc)
    return jwt.encode(data, settings.jwt_secret, algorithm=_ALGORITHM)


def decode_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[_ALGORITHM])
    except jwt.PyJWTError:
        return None
