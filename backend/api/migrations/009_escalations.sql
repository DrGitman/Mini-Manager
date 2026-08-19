-- Escalations — the record of the agent stopping to ask a human.
--
-- An escalation is a durable object, not a notification. A run can finish and
-- the process can recycle while a question is still open, so the question has
-- to outlive both.
--
-- interrupt_id is the join between the two stores. Strands keeps the paused
-- agent in its session manager; everything queryable lives here. Without this
-- column, resolving an escalation in the UI could not resume the agent that
-- raised it.

CREATE TABLE IF NOT EXISTS escalations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Which agent run raised it, and which Strands session/interrupt to resume.
    run_id        TEXT NOT NULL,
    session_id    TEXT NOT NULL,
    interrupt_id  TEXT,

    -- Why the agent stopped. 'sensitive' | 'low_confidence' | 'conflict'
    reason        TEXT NOT NULL,
    -- What it stopped about, and what it proposed doing.
    file_refs     JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- The agent's own words. Read this back to the user rather than
    -- regenerating an explanation, which would not match the original call.
    agent_note    TEXT NOT NULL DEFAULT '',
    options       JSONB NOT NULL DEFAULT '[]'::jsonb,

    status        TEXT NOT NULL DEFAULT 'open',   -- open | resolved | expired
    resolution    JSONB,

    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS escalations_user_open_idx
    ON escalations (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS escalations_interrupt_idx
    ON escalations (interrupt_id);


-- Agent runs — one row per invocation, interactive or scheduled.
--
-- tool_calls holds the trace: which tools ran, with what, and how long they
-- took. That is the evidence the agent did multi-step work, and it has to be
-- queryable from the app, which is why it lives here rather than only in
-- OpenTelemetry.

CREATE TABLE IF NOT EXISTS agent_runs (
    id            TEXT PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trigger       TEXT NOT NULL DEFAULT 'interactive',  -- interactive | scheduled | manual
    goal          TEXT NOT NULL DEFAULT '',
    started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at   TIMESTAMPTZ,
    files_seen    INTEGER NOT NULL DEFAULT 0,
    files_applied INTEGER NOT NULL DEFAULT 0,
    escalations   INTEGER NOT NULL DEFAULT 0,
    tool_calls    JSONB NOT NULL DEFAULT '[]'::jsonb,
    status        TEXT NOT NULL DEFAULT 'running'       -- running | done | failed | waiting
);

CREATE INDEX IF NOT EXISTS agent_runs_user_idx
    ON agent_runs (user_id, started_at DESC);
