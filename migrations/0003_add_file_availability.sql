ALTER TABLE files
ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT true;

-- Update any existing files that might already be missing (checking if file exists)