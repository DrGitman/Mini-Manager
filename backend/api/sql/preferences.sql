CREATE TABLE IF NOT EXISTS user_preferences (
    user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    naming_style     TEXT NOT NULL DEFAULT 'title'
                     CHECK (naming_style IN ('title', 'camel', 'kebab', 'snake', 'original')),
    categories       TEXT[] NOT NULL DEFAULT ARRAY['Documents','Images','Videos','Audio','Code','Archives'],
    target_folder    TEXT NOT NULL DEFAULT 'Desktop',
    quarantine_mode  TEXT NOT NULL DEFAULT 'auto'
                     CHECK (quarantine_mode IN ('auto', 'manual', 'never')),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
