-- Add is_global flag to folders so admins can create folders shared with all users
ALTER TABLE folders
  ADD COLUMN IF NOT EXISTS is_global BOOLEAN NOT NULL DEFAULT FALSE;
