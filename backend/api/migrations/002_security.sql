-- Security tables: login attempts (lockout), audit log, MFA secrets

-- Login attempt tracking for account lockout
CREATE TABLE IF NOT EXISTS login_attempts (
    id          BIGSERIAL   PRIMARY KEY,
    ip          TEXT        NOT NULL,
    email       TEXT        NOT NULL,
    failed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_email
    ON login_attempts (ip, email, failed_at DESC);

-- Cleanup function: purge attempts older than 15 minutes
-- (called inline; no cron needed for MVP)

-- Audit log: immutable record of security-relevant events
CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     TEXT,                          -- NULL for pre-auth events
    event_type  TEXT        NOT NULL,          -- 'login_ok' | 'login_fail' | 'lockout' | 'logout' | 'mfa_enabled' | 'mfa_disabled' | 'password_change' | 'account_delete' | 'data_export'
    ip          TEXT,
    user_agent  TEXT,
    detail      JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user   ON audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_event  ON audit_log (event_type, created_at DESC);

-- MFA secrets (TOTP)
CREATE TABLE IF NOT EXISTS mfa_secrets (
    user_id         UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    secret          TEXT        NOT NULL,           -- base32 TOTP secret (stored encrypted conceptually; encrypt in prod with KMS)
    verified        BOOLEAN     NOT NULL DEFAULT FALSE,
    recovery_codes  TEXT[]      NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    verified_at     TIMESTAMPTZ
);
