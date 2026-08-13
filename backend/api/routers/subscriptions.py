"""Paddle subscription endpoints.

POST /subscriptions/checkout  — create a Paddle transaction, return checkout URL
POST /webhooks/paddle         — verify signature, update user plan from events
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from ..config import settings
from ..middleware.auth import get_current_user
from ..services.db import get_pool

logger = logging.getLogger(__name__)
router = APIRouter(tags=["subscriptions"])

# ---------------------------------------------------------------------------
# Lazy Paddle client — instantiated once per process
# ---------------------------------------------------------------------------

_paddle_client = None


def _get_paddle():
    global _paddle_client
    if _paddle_client is None:
        if not settings.paddle_sandbox_api_key:
            raise HTTPException(503, "Paddle not configured")
        from paddle_billing import Client, Environment, Options
        _paddle_client = Client(
            settings.paddle_sandbox_api_key,
            options=Options(Environment.SANDBOX),
        )
    return _paddle_client


# ---------------------------------------------------------------------------
# POST /subscriptions/checkout
# ---------------------------------------------------------------------------

class CheckoutRequest(BaseModel):
    price_id: Optional[str] = None  # defaults to PADDLE_PRICE_ID_PRO


class CheckoutResponse(BaseModel):
    transaction_id: str
    checkout_url: str


@router.post("/subscriptions/checkout", response_model=CheckoutResponse)
async def create_checkout(
    body: CheckoutRequest,
    user=Depends(get_current_user),
):
    price_id = body.price_id or settings.paddle_price_id_pro
    if not price_id:
        raise HTTPException(503, "Pro price not configured")

    pool = get_pool()
    user_id = user["sub"]

    # Fetch paddle_customer_id (if any) and email
    row = await pool.fetchrow(
        "SELECT email, paddle_customer_id FROM users WHERE id = $1", user_id
    )
    if not row:
        raise HTTPException(404, "User not found")

    paddle = _get_paddle()

    from paddle_billing.Resources.Transactions.Operations import CreateTransaction
    from paddle_billing.Resources.Transactions.Operations.Create.TransactionCreateItem import (
        TransactionCreateItem,
    )
    from paddle_billing.Entities.Shared.Checkout import Checkout
    from paddle_billing.Entities.Shared.CustomData import CustomData
    from paddle_billing.Undefined import Undefined

    frontend = settings.frontend_url.rstrip("/")
    return_url = f"{frontend}/upgrade?paddle_status=success"

    # Pass Undefined (not None) when there is no customer yet — None sends null to the API
    paddle_customer_id = row["paddle_customer_id"] or Undefined()

    try:
        tx = paddle.transactions.create(
            CreateTransaction(
                items=[TransactionCreateItem(price_id=price_id, quantity=1)],
                customer_id=paddle_customer_id,
                checkout=Checkout(url=return_url),
                custom_data=CustomData({"user_id": user_id, "email": row["email"]}),
            )
        )
    except Exception as exc:
        detail = str(exc)
        logger.exception("Paddle create transaction failed: %s", detail)
        raise HTTPException(502, f"Could not create checkout session: {detail}") from exc

    checkout_url = tx.checkout.url if tx.checkout else ""
    return CheckoutResponse(transaction_id=tx.id, checkout_url=checkout_url)


# ---------------------------------------------------------------------------
# POST /webhooks/paddle
# ---------------------------------------------------------------------------

# Plans that Paddle events can set
_PLAN_MAP = {
    "pro": "pro",
    "business": "business",
}


def _verify_signature(body: bytes, ts: str, h1: str) -> bool:
    """Verify Paddle webhook signature (HMAC-SHA256)."""
    secret = settings.paddle_webhook_secret
    if not secret:
        # Webhook secret not set — skip verification in development
        logger.warning("PADDLE_WEBHOOK_SECRET not set — skipping signature check")
        return True
    signed_payload = f"{ts}:{body.decode()}"
    expected = hmac.new(
        secret.encode(), signed_payload.encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, h1)


@router.post("/webhooks/paddle", status_code=200, include_in_schema=False)
async def paddle_webhook(request: Request):
    raw = await request.body()

    # Paddle-Signature header: ts=...;h1=...
    sig_header = request.headers.get("Paddle-Signature", "")
    parts = dict(p.split("=", 1) for p in sig_header.split(";") if "=" in p)
    ts = parts.get("ts", "")
    h1 = parts.get("h1", "")

    if not _verify_signature(raw, ts, h1):
        raise HTTPException(401, "Invalid signature")

    # Replay attack guard: reject events older than 5 minutes
    if ts and abs(time.time() - int(ts)) > 300:
        raise HTTPException(401, "Timestamp too old")

    try:
        event = json.loads(raw)
    except Exception:
        raise HTTPException(400, "Invalid JSON")

    event_type = event.get("event_type", "")
    data = event.get("data", {})
    logger.info("Paddle webhook: %s", event_type)

    pool = get_pool()

    if event_type in ("subscription.activated", "subscription.updated"):
        await _handle_subscription_change(pool, data)

    elif event_type == "subscription.canceled":
        await _handle_subscription_canceled(pool, data)

    elif event_type == "transaction.completed":
        # Store customer_id from first successful transaction
        await _handle_transaction_completed(pool, data)

    return Response(status_code=200)


async def _resolve_user_id(pool, custom_data: dict, customer_id, data: dict):
    """Resolve user_id from customData.user_email → email lookup → customer_id lookup."""
    # 1. Explicit user_id (legacy / backend-created transactions)
    if uid := custom_data.get("user_id"):
        return uid
    # 2. Email from customData (Paddle.js overlay flow)
    if email := (custom_data.get("user_email") or (data.get("customer") or {}).get("email")):
        row = await pool.fetchrow("SELECT id FROM users WHERE email = $1", email)
        if row:
            return str(row["id"])
    # 3. Customer ID
    if customer_id:
        row = await pool.fetchrow("SELECT id FROM users WHERE paddle_customer_id = $1", customer_id)
        if row:
            return str(row["id"])
    return None


async def _handle_subscription_change(pool, data: dict):
    sub_id = data.get("id")
    customer_id = data.get("customer_id")
    custom_data = data.get("custom_data") or {}

    # Determine plan from items[0].price.custom_data.plan
    plan = "pro"
    items = data.get("items") or []
    if items:
        price_cd = (items[0].get("price") or {}).get("custom_data") or {}
        plan = _PLAN_MAP.get(price_cd.get("plan", "pro"), "pro")

    user_id = await _resolve_user_id(pool, custom_data, customer_id, data)
    if not user_id:
        logger.warning("Paddle webhook: cannot resolve user for subscription %s", sub_id)
        return

    await pool.execute(
        """UPDATE users
           SET plan = $1,
               paddle_subscription_id = $2,
               paddle_customer_id = COALESCE(paddle_customer_id, $3)
           WHERE id = $4""",
        plan, sub_id, customer_id, user_id,
    )
    logger.info("User %s upgraded to %s (sub %s)", user_id, plan, sub_id)


async def _handle_subscription_canceled(pool, data: dict):
    sub_id = data.get("id")
    customer_id = data.get("customer_id")
    custom_data = data.get("custom_data") or {}

    user_id = await _resolve_user_id(pool, custom_data, customer_id, data)
    if not user_id:
        logger.warning("Paddle webhook: cannot resolve user for canceled sub %s", sub_id)
        return

    await pool.execute(
        "UPDATE users SET plan = 'free' WHERE id = $1", user_id
    )
    logger.info("User %s reverted to free (sub %s canceled)", user_id, sub_id)


async def _handle_transaction_completed(pool, data: dict):
    customer_id = data.get("customer_id")
    custom_data = data.get("custom_data") or {}

    user_id = await _resolve_user_id(pool, custom_data, customer_id, data)
    if not user_id or not customer_id:
        return

    await pool.execute(
        "UPDATE users SET paddle_customer_id = $1 WHERE id = $2 AND paddle_customer_id IS NULL",
        customer_id, user_id,
    )
