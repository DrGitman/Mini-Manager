-- ─── Guest demo sessions ─────────────────────────────────────────────────────
--
-- The public demo runs the real agent, which spends Gemini and Groq credits on
-- every click. The action count therefore lives here rather than in the
-- browser: a localStorage counter is one DevTools edit away from unlimited, and
-- the endpoint is unauthenticated by design.
--
-- No foreign key to users, because a demo visitor has no account. That is the
-- whole point of the table.

CREATE TABLE IF NOT EXISTS demo_sessions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actions_used   INTEGER NOT NULL DEFAULT 0,
    -- Kept so an exhausted session can say what was spent, and so abuse is
    -- visible without reading application logs.
    actions        JSONB NOT NULL DEFAULT '[]'::jsonb,
    ip             TEXT,
    user_agent     TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_action_at TIMESTAMPTZ
);

-- Supports the per-IP rate limit on session creation, which is what stops one
-- visitor minting a fresh five actions every time they run out.
CREATE INDEX IF NOT EXISTS demo_sessions_ip_idx
    ON demo_sessions (ip, created_at DESC);
