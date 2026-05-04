-- 0022: Add auto-chapters columns to transcripts table
--
-- LLM-generated chapter markers derived from transcript segments.
-- Stored as a JSON array of { start, title, summary? } objects.

ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS chapters json;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS chapters_status text DEFAULT 'pending';
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS chapters_error text;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS chapters_model text;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS chapters_processed_at timestamp;
