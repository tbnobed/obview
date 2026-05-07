-- Make activity_logs.user_id nullable so unauthenticated actors
-- (public share-link "request changes" and reviewer uploads) can have
-- their actions audited. Their identity lives in metadata.
-- Idempotent: only drops NOT NULL if it's currently set.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'activity_logs'
      AND column_name = 'user_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE activity_logs ALTER COLUMN user_id DROP NOT NULL;
  END IF;
END $$;
