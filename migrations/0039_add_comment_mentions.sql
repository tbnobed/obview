-- Canonical, server-validated users mentioned by each unified comment.
ALTER TABLE comments_unified
  ADD COLUMN IF NOT EXISTS mentions jsonb NOT NULL DEFAULT '[]'::jsonb;