-- Add video_processing table for Frame.io-style video optimization
CREATE TABLE IF NOT EXISTS video_processing (
    id SERIAL PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    qualities JSON,
    scrub_version_path TEXT,
    thumbnail_sprite_path TEXT,
    sprite_metadata JSON,
    duration INTEGER,
    frame_rate INTEGER,
    error_message TEXT,
    processed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add index for efficient lookups by file_id
CREATE INDEX IF NOT EXISTS idx_video_processing_file_id ON video_processing(file_id);
-- Add index for status queries
CREATE INDEX IF NOT EXISTS idx_video_processing_status ON video_processing(status);