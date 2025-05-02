-- Add theme_preference column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preference TEXT DEFAULT 'system';

-- Only update NULL values to 'system', preserving any existing preferences
UPDATE users SET theme_preference = 'system' WHERE theme_preference IS NULL;