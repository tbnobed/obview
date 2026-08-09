-- QC reports: one per file. Findings from black/freeze frame analysis,
-- audio-event detection (coughs etc.), and on-screen text spell check.
CREATE TABLE IF NOT EXISTS qc_reports (
  id SERIAL PRIMARY KEY,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  findings JSON,
  detectors JSON,
  ocr_blocks JSON,
  error_message TEXT,
  processed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- One report per file, enforced: concurrent auto-trigger + manual regenerate
-- must not create duplicate rows.
CREATE UNIQUE INDEX IF NOT EXISTS qc_reports_file_id_idx ON qc_reports(file_id);
