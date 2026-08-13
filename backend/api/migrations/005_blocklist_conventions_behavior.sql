-- ─── Blocklist (protected paths — never touch) ───────────────────────────────
CREATE TABLE IF NOT EXISTS blocklist (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    path        TEXT NOT NULL,
    reason      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS blocklist_user_path_idx ON blocklist (user_id, path);

-- ─── Conventions (user-stated rules, outrank AI inferences) ───────────────────
CREATE TABLE IF NOT EXISTS conventions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scope       TEXT NOT NULL DEFAULT 'global',      -- 'global' | folder path
    rule_text   TEXT NOT NULL,                        -- natural language the user typed
    compiled    JSONB,                                -- structured form: {pattern, action}
    source      TEXT NOT NULL DEFAULT 'stated',       -- 'stated' | 'inferred' | 'corrected'
    active      BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS conventions_user_id_idx ON conventions (user_id, active);

-- ─── Behavioral events (what the user does, when, how often) ─────────────────
CREATE TABLE IF NOT EXISTS behavior_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type  TEXT NOT NULL,    -- 'scan' | 'apply' | 'reject' | 'undo' | 'edit_proposal'
    folder_path TEXT,
    file_count  INTEGER,
    accept_rate REAL,             -- fraction of proposals accepted (0.0–1.0)
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS behavior_events_user_idx ON behavior_events (user_id, created_at DESC);

-- ─── Support tickets (for support agent) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    email           TEXT,
    subject         TEXT,
    message         TEXT NOT NULL,
    ai_reply        TEXT,
    escalated       BOOLEAN NOT NULL DEFAULT false,
    resolved        BOOLEAN NOT NULL DEFAULT false,
    autonomous      BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON support_tickets (user_id, created_at DESC);
