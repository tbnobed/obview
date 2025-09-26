-- Create unified comments table
CREATE TABLE comments_unified (
    id TEXT PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_public BOOLEAN DEFAULT false NOT NULL,
    author_name TEXT NOT NULL,
    author_email TEXT NOT NULL,
    creator_token TEXT,
    parent_id TEXT REFERENCES comments_unified(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    timestamp DECIMAL,
    is_resolved BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_comments_unified_file_id ON comments_unified(file_id);
CREATE INDEX idx_comments_unified_parent_id ON comments_unified(parent_id);
CREATE INDEX idx_comments_unified_file_timestamp ON comments_unified(file_id, timestamp);