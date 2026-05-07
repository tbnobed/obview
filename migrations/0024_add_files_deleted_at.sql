-- 0024: Add deleted_at to files for soft-delete + auto-purge
--
-- The files.deleted_at column was added to shared/schema.ts when the file
-- trash / hourly auto-purge feature shipped, but no SQL migration was
-- authored at the time. Production (and any dev DB that did not run
-- `npm run db:push`) is missing the column, which 500s every project
-- file listing because storage queries filter `isNull(files.deleted_at)`.
--
-- Idempotent: safe to re-run.

ALTER TABLE files ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_files_deleted_at ON files(deleted_at);
