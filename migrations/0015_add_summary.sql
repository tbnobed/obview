-- Add AI synopsis columns to transcripts table for local llama.cpp summarization
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS summary_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS summary_error TEXT;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS summary_model TEXT;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS summary_processed_at TIMESTAMP;
