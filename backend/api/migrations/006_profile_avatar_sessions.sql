-- ─── Profile fields, avatar, and session revocation ───────────────────────────
-- Supersedes the ad-hoc ALTER that used to run from routers/profile.py.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS company   TEXT,
    ADD COLUMN IF NOT EXISTS location  TEXT,
    ADD COLUMN IF NOT EXISTS bio       TEXT;

-- Avatar stored inline as a small data: URL (client downscales to 256x256
-- before upload; the API rejects anything over ~200 KB).
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- "Sign out all devices": any access token issued (iat) before this instant is
-- rejected by get_current_user. NULL means no revocation has happened.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS sessions_valid_from TIMESTAMPTZ;
