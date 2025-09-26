-- Create comment reactions table
CREATE TABLE comment_reactions (
    id SERIAL PRIMARY KEY,
    comment_id TEXT NOT NULL REFERENCES comments_unified(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    creator_token TEXT,
    reaction_type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_comment_reactions_comment_id ON comment_reactions(comment_id);
CREATE INDEX idx_comment_reactions_comment_reaction ON comment_reactions(comment_id, reaction_type);

-- Ensure unique reactions per user/comment combination
-- For authenticated users
CREATE UNIQUE INDEX idx_comment_reactions_unique_user 
ON comment_reactions(comment_id, reaction_type, user_id) 
WHERE creator_token IS NULL;

-- For anonymous users  
CREATE UNIQUE INDEX idx_comment_reactions_unique_anonymous 
ON comment_reactions(comment_id, reaction_type, creator_token) 
WHERE user_id IS NULL;