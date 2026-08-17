"""Centralised settings loaded from environment variables.

Note: this module uses no relative imports so it can be imported both
when the package is run as `uvicorn main:app` (flat layout inside the
container) and when it is run as `uvicorn api.main:app` from the repo root.
"""

from __future__ import annotations
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Always resolve .env relative to this file, regardless of where uvicorn is launched from
_ENV_FILE = Path(__file__).parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Database (Neon / Postgres)
    database_url: str

    # Gemini (Google Cloud — hackathon requirement, used for explain)
    gemini_api_key: str
    # Single source of truth for the Gemini model. Prefer a "-latest" alias:
    # pinned versions get decommissioned (gemini-2.0-flash died 2026-08) and the
    # alias keeps tracking a supported model. Override with GEMINI_MODEL.
    gemini_model: str = "gemini-flash-lite-latest"

    # Groq (main classify engine)
    groq_api_key: str
    # Single source of truth for the Groq model. llama-3.3-70b-versatile was
    # decommissioned 2026-08-16; gpt-oss-120b is Groq's recommended replacement
    # (same 131k context, JSON mode supported). Override with GROQ_MODEL.
    groq_model: str = "openai/gpt-oss-120b"

    # JWT
    jwt_secret: str

    # ── EFT payments (Namibia) ───────────────────────────────────────────────
    # Shown to the customer on the payment page. Set these in .env — they are
    # real banking details and do not belong in the repo.
    eft_account_name: str = ""
    eft_bank_name: str = ""
    eft_account_number: str = ""
    eft_branch_code: str = ""
    # Currency the receiving account actually holds. NAD for FNB Namibia,
    # ZAR for FNB South Africa — they are pegged 1:1 but are different codes,
    # and a mismatch causes every proof to be rejected.
    eft_currency: str = "NAD"
    # Price for each plan, and how long a claim stays open.
    eft_amount_pro: float = 349.00
    eft_amount_business: float = 899.00
    eft_claim_expiry_days: int = 7
    # Proofs at or above this confidence, with all hard checks passing, are
    # activated autonomously. Below it, the agent defers to human review.
    eft_auto_activate_confidence: float = 0.85
    # Account allowed to reconcile payments. Empty = admin endpoints are closed.
    # This is an access check against the login token — nothing is emailed to it.
    eft_admin_email: str = ""
    # Shown to customers who would rather email their proof than upload it.
    # Leave empty to hide that option entirely.
    eft_proof_email: str = ""

    # CORS
    frontend_url: str = "https://mini-manager.vercel.app"
    # Comma-separated extra origins allowed to call the API (preview deploys,
    # custom domains). Leave empty for local development.
    extra_cors_origins: str = ""

    # Optional
    environment: str = "production"

    # Paddle
    paddle_sandbox_api_key: str = ""
    paddle_webhook_secret: str = ""
    paddle_price_id_pro: str = ""

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""
    api_base_url: str = "http://localhost:8000"


settings = Settings()  # type: ignore[call-arg]
