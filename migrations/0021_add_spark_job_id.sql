-- 0021: Add spark_job_id column to transcripts table
--
-- Tracks the async job ID returned by the DGX Spark companion service
-- so the app can resume polling after a restart if a transcription was
-- in-flight when the container went down.

ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS spark_job_id text;
