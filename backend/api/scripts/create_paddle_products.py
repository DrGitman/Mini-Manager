"""One-time script: create Mini Manager products + prices in Paddle sandbox.

Run from the repo root:
    api/.venv/Scripts/python.exe api/scripts/create_paddle_products.py
"""
import os
import sys
from pathlib import Path

# Load .env from api/.env
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

import paddle_billing
from paddle_billing import Client, Environment, Options
from paddle_billing.Entities.Shared import (
    CurrencyCode, CustomData, Duration, Interval, Money, TaxCategory,
)
from paddle_billing.Resources.Products.Operations import CreateProduct
from paddle_billing.Resources.Prices.Operations import CreatePrice

api_key = os.environ.get("PADDLE_SANDBOX_API_KEY")
if not api_key:
    sys.exit("PADDLE_SANDBOX_API_KEY not set")

paddle = Client(api_key, options=Options(Environment.SANDBOX))

# ── Create Pro product ────────────────────────────────────────────────────────
print("Creating Pro product...")
product = paddle.products.create(
    CreateProduct(
        name="Mini Manager Pro",
        tax_category=TaxCategory.SAAS,
        description="Unlimited AI file organisation — scans, classifications, rules, and duplicate detection.",
        custom_data=CustomData({"plan": "pro"}),
    )
)
product_id = product.id
print(f"  Product ID: {product_id}")

# ── Create monthly price ($19/mo) ─────────────────────────────────────────────
print("Creating Pro monthly price ($19/mo)...")
price = paddle.prices.create(
    CreatePrice(
        description="Pro Monthly",
        product_id=product_id,
        unit_price=Money(amount="1900", currency_code=CurrencyCode.USD),
        billing_cycle=Duration(interval=Interval.Month, frequency=1),
        trial_period=None,
        custom_data=CustomData({"plan": "pro", "billing": "monthly"}),
    )
)
price_id = price.id
print(f"  Price ID: {price_id}")

# ── Print .env snippet ────────────────────────────────────────────────────────
print()
print("Add these to api/.env:")
print(f"PADDLE_PRODUCT_ID_PRO={product_id}")
print(f"PADDLE_PRICE_ID_PRO={price_id}")
