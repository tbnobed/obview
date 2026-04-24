-- Add watermark options to share links so reviewers see tiled
-- email/timecode overlay on shared media (deters screen-recording leaks).
ALTER TABLE share_links
  ADD COLUMN IF NOT EXISTS watermark_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS watermark_text TEXT;
