-- Widen comment timestamp columns from integer to double precision so we can
-- store frame-accurate playhead positions (e.g. 3.924133s on a 24fps clip)
-- instead of rounding to whole seconds. The application layer was updated to
-- send the exact currentTime without flooring; the prior integer columns then
-- rejected the inserts ("invalid input syntax for type integer: 3.924133").
--
-- Idempotent: only alters columns that are still integer-typed, so re-running
-- after a successful migration is a no-op.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comments' AND column_name = 'timestamp' AND data_type = 'integer'
  ) THEN
    ALTER TABLE comments
      ALTER COLUMN "timestamp" TYPE double precision USING "timestamp"::double precision;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'public_comments' AND column_name = 'timestamp' AND data_type = 'integer'
  ) THEN
    ALTER TABLE public_comments
      ALTER COLUMN "timestamp" TYPE double precision USING "timestamp"::double precision;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comments_unified' AND column_name = 'timestamp' AND data_type = 'integer'
  ) THEN
    ALTER TABLE comments_unified
      ALTER COLUMN "timestamp" TYPE double precision USING "timestamp"::double precision;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comments_unified' AND column_name = 'in_point' AND data_type = 'integer'
  ) THEN
    ALTER TABLE comments_unified
      ALTER COLUMN in_point TYPE double precision USING in_point::double precision;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'comments_unified' AND column_name = 'out_point' AND data_type = 'integer'
  ) THEN
    ALTER TABLE comments_unified
      ALTER COLUMN out_point TYPE double precision USING out_point::double precision;
  END IF;
END $$;
