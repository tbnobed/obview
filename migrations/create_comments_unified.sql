-- Migration: Create comments_unified table for production deployment
-- This allows the unified comment system to work in Docker environments

CREATE TABLE IF NOT EXISTS comments_unified (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id INTEGER NOT NULL,
    user_id INTEGER,
    is_public BOOLEAN NOT NULL DEFAULT false,
    author_name TEXT NOT NULL,
    author_email TEXT,
    creator_token TEXT,
    parent_id TEXT,
    content TEXT NOT NULL,
    timestamp INTEGER,
    is_resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add foreign key constraints
ALTER TABLE comments_unified 
ADD CONSTRAINT fk_comments_unified_file_id 
FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE;

ALTER TABLE comments_unified 
ADD CONSTRAINT fk_comments_unified_user_id 
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE comments_unified 
ADD CONSTRAINT fk_comments_unified_parent_id 
FOREIGN KEY (parent_id) REFERENCES comments_unified(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_comments_unified_file_id ON comments_unified(file_id);
CREATE INDEX IF NOT EXISTS idx_comments_unified_user_id ON comments_unified(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_unified_parent_id ON comments_unified(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_unified_is_public ON comments_unified(is_public);
CREATE INDEX IF NOT EXISTS idx_comments_unified_created_at ON comments_unified(created_at);