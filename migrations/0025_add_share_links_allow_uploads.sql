-- 0025: Add allow_uploads to share_links for reviewer uploads via project share-links
--
-- Same miss as 0024: column was added to shared/schema.ts when the reviewer
-- upload feature shipped but no SQL migration was authored, so prod 500s on
-- INSERT INTO share_links (the column appears in the column list but does
-- not exist on the table).
--
-- Idempotent: safe to re-run.

ALTER TABLE share_links ADD COLUMN IF NOT EXISTS allow_uploads BOOLEAN NOT NULL DEFAULT false;
