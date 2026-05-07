-- Add `requested_changes_by_email` to files for share-link reviewers
-- who have no user account. Consulted by the new-version upload path
-- only when `requested_changes_by_id` is NULL. Cleared on approve.
ALTER TABLE files
  ADD COLUMN IF NOT EXISTS requested_changes_by_email TEXT;
