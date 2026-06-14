-- Adds a per-version real uploaded name to files. `filename` is the SHARED
-- stack key that groups all versions of a file (and is overwritten with the
-- stack key on version upload), so it can't tell you which version you're
-- viewing. `original_filename` records the actual name of the file uploaded
-- for THIS version (e.g. "Rough V4.mp4"). Nullable: pre-existing rows (whose
-- real names were already lost at upload time) fall back to `filename` in the UI.

ALTER TABLE files
  ADD COLUMN IF NOT EXISTS original_filename text;
