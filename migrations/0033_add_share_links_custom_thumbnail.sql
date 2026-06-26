-- Per-link custom social-preview (Open Graph) image (path relative to
-- UPLOAD_DIR or absolute). NULL = no custom thumbnail, the link preview
-- falls back to an auto-derived file/scope thumbnail (unprotected links only).
ALTER TABLE share_links
  ADD COLUMN IF NOT EXISTS custom_thumbnail_path TEXT;
