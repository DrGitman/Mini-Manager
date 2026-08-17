-- Scope the classification cache to one user.
--
-- The cache was keyed on sha256(filename + extension + size) alone, with no
-- user column. Two accounts holding a file with the same name and size shared
-- a row, so the second account was served the first one's category, suggested
-- name and target folder — and a target folder is often named after a client
-- or a project. That is one user's private structure reaching another.
--
-- Existing rows cannot be attributed to an owner after the fact, and they are
-- the cross-contaminated ones. This is derived data that rebuilds itself on the
-- next scan, so they are dropped rather than migrated.
--
-- Migrations re-run on every boot, so the destructive step is guarded on the
-- column being absent. Without that guard this would empty the cache each time
-- the service restarted.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'classification_cache' AND column_name = 'user_id'
  ) THEN
    DELETE FROM classification_cache;

    ALTER TABLE classification_cache
      ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;

    ALTER TABLE classification_cache
      ALTER COLUMN user_id SET NOT NULL;
  END IF;
END $$;

-- The old index made the fingerprint globally unique, which is what forced the
-- sharing. Uniqueness now belongs to the pair.
DROP INDEX IF EXISTS classification_cache_fingerprint_idx;

CREATE UNIQUE INDEX IF NOT EXISTS classification_cache_user_fingerprint_idx
  ON classification_cache (user_id, fingerprint);

CREATE INDEX IF NOT EXISTS classification_cache_user_idx
  ON classification_cache (user_id);
