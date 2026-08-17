"""
Proof-of-payment reading and validation.

Split deliberately in two:

  * `extract_proof()` asks Gemini for FACTS ONLY — what is visibly on the
    document. It never decides anything.
  * `evaluate()` is plain deterministic Python that judges those facts against
    the pending claim.

Letting the model return "activate: true" would mean a forged document could
argue its own case. The model reports; the rules decide.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from google.genai import types as genai_types

from ..config import settings
from . import gemini as gemini_svc

logger = logging.getLogger(__name__)

MAX_PROOF_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_MIME = {"application/pdf", "image/png", "image/jpeg", "image/webp"}

_SYSTEM = """\
You read proof-of-payment documents from Namibian banks (FNB, Bank Windhoek,
Standard Bank, Nedbank) and extract the transaction details.

Extract only what is visibly present in the document. Do not infer, complete,
or guess any field. If a field is not clearly legible, set it to null and
lower your confidence.

Note anything that suggests the document has been altered: mismatched fonts,
inconsistent alignment, misaligned or overlapping text, compression artefacts
around numbers, or figures that do not add up. Report these in `flags`. You are
not making a final judgement about authenticity — you are reporting what you
observe.

You do NOT decide whether to accept the payment. Report facts only.

Output valid JSON matching the schema. No prose, no markdown fences."""

_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "amount": {"type": "number", "nullable": True},
        "currency": {"type": "string", "nullable": True},
        "reference": {"type": "string", "nullable": True},
        "payment_date": {"type": "string", "nullable": True},
        "sender_name": {"type": "string", "nullable": True},
        "sender_bank": {"type": "string", "nullable": True},
        "beneficiary": {"type": "string", "nullable": True},
        "document_type": {
            "type": "string",
            "enum": [
                "proof_of_payment", "bank_statement", "screenshot",
                "receipt", "unclear", "not_a_payment",
            ],
        },
        "confidence": {"type": "number"},
        "flags": {"type": "array", "items": {"type": "string"}},
        "reasoning": {"type": "string"},
    },
    "required": ["document_type", "confidence", "flags", "reasoning"],
}


async def extract_proof(file_bytes: bytes, mime_type: str) -> dict[str, Any]:
    """Ask Gemini what is on the document. Facts only — no judgement."""
    client = gemini_svc._get_gemini()
    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=[
            genai_types.Part.from_bytes(data=file_bytes, mime_type=mime_type),
            "Extract the payment details from this document.",
        ],
        config=genai_types.GenerateContentConfig(
            system_instruction=_SYSTEM,
            response_mime_type="application/json",
            response_schema=_RESPONSE_SCHEMA,
        ),
    )
    raw = (response.text or "").strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Proof extraction returned non-JSON: %s", raw[:300])
        return {
            "document_type": "unclear",
            "confidence": 0.0,
            "flags": ["extraction failed — model did not return valid JSON"],
            "reasoning": "The document could not be read.",
        }

    data.setdefault("flags", [])
    data.setdefault("confidence", 0.0)
    data.setdefault("reasoning", "")
    data.setdefault("document_type", "unclear")
    return data


# ─── Deterministic decision ───────────────────────────────────────────────────

@dataclass
class Decision:
    action: str                       # activate | review | reject
    reasons: list[str] = field(default_factory=list)

    def explain(self) -> str:
        if not self.reasons:
            return "All checks passed."
        return "; ".join(self.reasons)


def _norm_ref(value: str) -> str:
    """Compare references ignoring case, spaces and dashes."""
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def _parse_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d %B %Y", "%d %b %Y"):
        try:
            return datetime.strptime(value.strip(), fmt).date()
        except ValueError:
            continue
    return None


def _to_decimal(value: Any) -> Optional[Decimal]:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


def evaluate(extracted: dict[str, Any], claim: dict[str, Any]) -> Decision:
    """
    Judge the extracted facts against the pending claim.

    Hard failures reject outright. Soft concerns route to a human. Only a clean
    pass with sufficient confidence activates autonomously.
    """
    fails: list[str] = []
    warns: list[str] = []

    expected_amount = _to_decimal(claim["expected_amount"]) or Decimal("0")

    # ── hard fails ────────────────────────────────────────────────────────────
    if extracted.get("document_type") in ("not_a_payment", "unclear"):
        fails.append("document is not a readable proof of payment")

    got_ref = _norm_ref(extracted.get("reference") or "")
    want_ref = _norm_ref(claim["reference"])
    if not got_ref:
        fails.append("no payment reference found on the document")
    elif want_ref not in got_ref:
        fails.append(
            f"reference '{extracted.get('reference')}' does not match {claim['reference']}"
        )

    amount = _to_decimal(extracted.get("amount"))
    if amount is None:
        fails.append("no amount found on the document")
    elif amount < expected_amount:
        fails.append(f"amount {amount} is below the expected {expected_amount}")

    # Banks print the symbol rather than the ISO code, so accept both forms of
    # whichever currency the receiving account actually holds.
    _SYMBOLS = {"NAD": {"N$"}, "ZAR": {"R", "RAND"}, "USD": {"$"}}
    want_currency = claim["currency"].upper()
    accepted = {want_currency} | _SYMBOLS.get(want_currency, set())
    currency = extracted.get("currency")
    if currency and currency.strip().upper() not in accepted:
        fails.append(f"currency {currency} is not {claim['currency']}")

    if claim["status"] not in ("awaiting_proof", "needs_review"):
        fails.append(f"this claim is already {claim['status']}")

    expires_at = claim["expires_at"]
    if expires_at and datetime.now(timezone.utc) > expires_at:
        fails.append("this payment claim has expired")

    # ── soft concerns ─────────────────────────────────────────────────────────
    confidence = float(extracted.get("confidence") or 0.0)
    if confidence < settings.eft_auto_activate_confidence:
        warns.append(f"low extraction confidence ({confidence:.2f})")

    for flag in extracted.get("flags") or []:
        warns.append(str(flag))

    paid_on = _parse_date(extracted.get("payment_date"))
    created = claim["created_at"]
    if paid_on is None:
        warns.append("no payment date found")
    else:
        earliest = (created - timedelta(days=1)).date()
        latest = datetime.now(timezone.utc).date()
        if not (earliest <= paid_on <= latest):
            warns.append(f"payment date {paid_on} is outside the expected window")

    if amount is not None and expected_amount > 0 and amount > expected_amount * 2:
        warns.append("amount is much larger than expected")

    if fails:
        return Decision("reject", fails)
    if warns:
        return Decision("review", warns)
    return Decision("activate", [])
