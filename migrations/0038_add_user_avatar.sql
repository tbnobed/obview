-- Optional profile picture. Path on disk under uploads/avatars/.
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_path text;
