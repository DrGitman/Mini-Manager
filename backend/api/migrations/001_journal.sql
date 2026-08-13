-- Append-only operation journal for History + Archive
-- Every file move, archive, restore, or undo is an immutable row.
-- Current file location = latest op's to_location.
-- Archive = files whose latest op moved them into the archive path.

CREATE TABLE IF NOT EXISTS batches (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT        NOT NULL,
    label       TEXT        NOT NULL,
    folder_path TEXT        NOT NULL DEFAULT '',
    op_count    INT         NOT NULL DEFAULT 0,
    status      TEXT        NOT NULL DEFAULT 'applied',  -- 'applied' | 'partial' | 'undone'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_batches_user ON batches (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS file_ops (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       TEXT        NOT NULL,
    batch_id      UUID        NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    file_name     TEXT        NOT NULL,
    from_location TEXT        NOT NULL,  -- original path before this op
    to_location   TEXT        NOT NULL,  -- path after this op
    op_type       TEXT        NOT NULL DEFAULT 'move',  -- 'move' | 'archive' | 'restore' | 'undo'
    skipped       BOOLEAN     NOT NULL DEFAULT FALSE,   -- TRUE when undo found file already moved
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_file_ops_batch  ON file_ops (batch_id);
CREATE INDEX IF NOT EXISTS idx_file_ops_user   ON file_ops (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_ops_name   ON file_ops (user_id, file_name);

-- View: current archived files (last op moved them into archive)
-- Uses DISTINCT ON to get only the latest op per file.
CREATE OR REPLACE VIEW archived_files AS
SELECT DISTINCT ON (user_id, file_name)
    id            AS op_id,
    user_id,
    batch_id,
    file_name,
    from_location AS original_path,
    to_location   AS archive_path,
    op_type,
    created_at    AS archived_at
FROM file_ops
WHERE to_location LIKE '%/archive/%'
   OR to_location LIKE '%/quarantine/%'
   OR op_type = 'archive'
ORDER BY user_id, file_name, created_at DESC;
