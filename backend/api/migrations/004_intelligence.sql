-- ─── Corrections memory ──────────────────────────────────────────────────────
-- Stores user overrides so the AI can learn from them
CREATE TABLE IF NOT EXISTS corrections (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pattern     TEXT NOT NULL,       -- e.g. "pdf, name contains 'invoice'"
    proposed    TEXT NOT NULL,       -- what the AI suggested
    corrected   TEXT NOT NULL,       -- what the user actually did/preferred
    field       TEXT NOT NULL DEFAULT 'target_folder',  -- 'target_folder' | 'new_name' | 'rejected'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS corrections_user_id_idx ON corrections (user_id, created_at DESC);

-- ─── Agent decision log ───────────────────────────────────────────────────────
-- Audit trail: every autonomous AI action goes here
CREATE TABLE IF NOT EXISTS agent_decisions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    agent          TEXT NOT NULL,        -- 'classifier' | 'agent_chat' | 'folder_analyzer'
    trigger_event  TEXT NOT NULL,
    input_json     JSONB,
    model          TEXT NOT NULL DEFAULT 'llama-3.3-70b-versatile',
    reasoning      TEXT,
    action_taken   TEXT,
    autonomous     BOOLEAN NOT NULL DEFAULT true,
    human_override BOOLEAN NOT NULL DEFAULT false,
    latency_ms     INTEGER,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS agent_decisions_user_idx ON agent_decisions (user_id, created_at DESC);

-- ─── Applied files (idempotency) ──────────────────────────────────────────────
-- After a user applies a proposal, record the fingerprint + final path
-- On rescan, skip files already at their organised location
CREATE TABLE IF NOT EXISTS applied_files (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fingerprint   VARCHAR(64) NOT NULL,
    applied_path  TEXT NOT NULL,
    applied_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS applied_files_user_fp_idx ON applied_files (user_id, fingerprint);
