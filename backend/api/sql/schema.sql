-- Mini Manager DB Schema
-- Run this once against your Neon/Postgres instance

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                   TEXT NOT NULL UNIQUE,
    name                    TEXT NOT NULL,
    password_hash           TEXT NOT NULL,
    plan                    TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'business')),
    monthly_token_budget    INTEGER NOT NULL DEFAULT 100000,  -- tokens per month
    tokens_used_this_month  INTEGER NOT NULL DEFAULT 0,
    budget_reset_at         TIMESTAMPTZ NOT NULL DEFAULT date_trunc('month', NOW()) + INTERVAL '1 month',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);

-- ─── Scans ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scans (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder_path  TEXT NOT NULL,
    file_count   INTEGER NOT NULL DEFAULT 0,
    proposals    JSONB NOT NULL DEFAULT '[]',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scans_user_id_idx ON scans (user_id, created_at DESC);

-- ─── Classification Cache ─────────────────────────────────────────────────────
-- fingerprint = sha256(lower(filename) || lower(extension) || size_bytes::text)
CREATE TABLE IF NOT EXISTS classification_cache (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Scoped per user. A fingerprint is only sha256(name + extension + size),
    -- so without this column two accounts owning a file with the same name and
    -- size share a row — and the stored target_folder is often named after a
    -- client or project. See migrations/008_scope_cache_to_user.sql.
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fingerprint   VARCHAR(64) NOT NULL,
    filename      TEXT NOT NULL,
    extension     TEXT NOT NULL,
    category      TEXT NOT NULL,
    new_name      TEXT NOT NULL,
    target_folder TEXT NOT NULL,
    confidence    FLOAT NOT NULL,
    source        TEXT NOT NULL DEFAULT 'ai',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS classification_cache_user_fingerprint_idx
    ON classification_cache (user_id, fingerprint);
CREATE INDEX IF NOT EXISTS classification_cache_user_idx ON classification_cache (user_id);

-- ─── Token Log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    endpoint    TEXT NOT NULL,
    model       TEXT NOT NULL,
    tokens_in   INTEGER NOT NULL DEFAULT 0,
    tokens_out  INTEGER NOT NULL DEFAULT 0,
    cost_usd    NUMERIC(10, 6) NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS token_log_user_id_idx ON token_log (user_id, created_at DESC);

-- ─── Budget reset function (call via cron or manually) ────────────────────────
CREATE OR REPLACE FUNCTION reset_monthly_budgets() RETURNS void AS $$
BEGIN
    UPDATE users
    SET tokens_used_this_month = 0,
        budget_reset_at = date_trunc('month', NOW()) + INTERVAL '1 month'
    WHERE budget_reset_at <= NOW();
END;
$$ LANGUAGE plpgsql;
