-- Add directed review loop fields to files table.
--
-- See shared/schema.ts (files table) and the approve / version-upload
-- routes in server/routes.ts for how these are used.
--
-- Both columns are added idempotently so re-applying this migration is safe.

ALTER TABLE files
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'needs_review';

ALTER TABLE files
  ADD COLUMN IF NOT EXISTS requested_changes_by_id INTEGER;

-- Add the FK only if it isn't already present.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'files_requested_changes_by_id_fkey'
      AND table_name = 'files'
  ) THEN
    ALTER TABLE files
      ADD CONSTRAINT files_requested_changes_by_id_fkey
      FOREIGN KEY (requested_changes_by_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Backfill: any existing file that already has an 'approved' approval row
-- gets review_status='approved'; any file that already has a
-- 'changes_requested' / 'requested_changes' row gets that state and we
-- pick the most recent reviewer as the open-loop person to notify.
-- "Changes wins" — same precedence the per-file rollup uses.
UPDATE files f SET review_status = 'approved'
WHERE review_status = 'needs_review'
  AND EXISTS (
    SELECT 1 FROM approvals a WHERE a.file_id = f.id AND a.status = 'approved'
  )
  AND NOT EXISTS (
    SELECT 1 FROM approvals a WHERE a.file_id = f.id
      AND a.status IN ('changes_requested', 'requested_changes')
  );

UPDATE files f SET
  review_status = 'changes_requested',
  requested_changes_by_id = (
    SELECT a.user_id FROM approvals a
    WHERE a.file_id = f.id
      AND a.status IN ('changes_requested', 'requested_changes')
    ORDER BY a.created_at DESC
    LIMIT 1
  )
WHERE review_status = 'needs_review'
  AND EXISTS (
    SELECT 1 FROM approvals a WHERE a.file_id = f.id
      AND a.status IN ('changes_requested', 'requested_changes')
  );
