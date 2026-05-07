-- Custom project poster image (path relative to UPLOAD_DIR or absolute).
-- NULL = no custom thumbnail, card falls back to latest video sprite.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS custom_thumbnail_path TEXT;
