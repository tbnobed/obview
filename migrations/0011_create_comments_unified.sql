-- Create unified comments table
CREATE TABLE IF NOT EXISTS comments_unified (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    is_public BOOLEAN DEFAULT false NOT NULL,
    author_name TEXT NOT NULL,
    author_email TEXT,
    creator_token TEXT,
    parent_id TEXT REFERENCES comments_unified(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    timestamp INTEGER,
    annotations TEXT,
    is_resolved BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_comments_unified_file_id ON comments_unified(file_id);
CREATE INDEX IF NOT EXISTS idx_comments_unified_user_id ON comments_unified(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_unified_parent_id ON comments_unified(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_unified_file_timestamp ON comments_unified(file_id, timestamp);
