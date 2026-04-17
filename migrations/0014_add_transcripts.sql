-- Add transcripts table for local (whisper.cpp) audio/video transcription
CREATE TABLE IF NOT EXISTS transcripts (
  id SERIAL PRIMARY KEY,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  language TEXT,
  model_name TEXT,
  segments JSON,
  text TEXT,
  error_message TEXT,
  processed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS transcripts_file_id_idx ON transcripts(file_id);
