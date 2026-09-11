-- ─── Guest demo: a real, disposable account per session ──────────────────────
--
-- The first version put "demo:<uuid>" in the token's `sub` and kept the ledger
-- entirely separate from `users`. That broke as soon as a guest touched any
-- ordinary endpoint: `sub` is used directly as a user UUID in SQL all over the
-- application, so /classify died with
--
--     ValueError: invalid UUID 'demo:...': got 41 characters
--
-- and every other user-scoped route would have done the same. Special-casing
-- each one is a losing game — the demo is meant to be the real app, and the
-- real app assumes a real account.
--
-- So a guest now gets an actual users row. Everything downstream — foreign
-- keys, scoping, preferences, journal writes — works with no knowledge that
-- the account is temporary. What makes it a demo is the `demo: true` claim on
-- the token and the action ledger, not a different shape of user.
--
-- The password hash is deliberately impossible to satisfy: these accounts exist
-- to be referenced, never to be logged into.

ALTER TABLE demo_sessions
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS demo_sessions_user_idx ON demo_sessions (user_id);
