-- Create comment reactions table (idempotent)
CREATE TABLE IF NOT EXISTS comment_reactions (
    id SERIAL PRIMARY KEY,
    comment_id TEXT NOT NULL,
    user_id INTEGER,
    creator_token TEXT,
    reaction_type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add foreign key constraints individually so a missing parent table
-- doesn't take the whole migration down.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comment_reactions_comment_id_fkey')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='comments_unified') THEN
        ALTER TABLE comment_reactions ADD CONSTRAINT comment_reactions_comment_id_fkey
            FOREIGN KEY (comment_id) REFERENCES comments_unified(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping comment_reactions_comment_id_fkey: %', SQLERRM;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comment_reactions_user_id_fkey') THEN
        ALTER TABLE comment_reactions ADD CONSTRAINT comment_reactions_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping comment_reactions_user_id_fkey: %', SQLERRM;
END $$;

-- Create indexes for performance (idempotent)
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_id ON comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_reaction ON comment_reactions(comment_id, reaction_type);

-- Ensure unique reactions per user/comment combination
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_comment_reactions_unique_user') THEN
        CREATE UNIQUE INDEX idx_comment_reactions_unique_user
        ON comment_reactions(comment_id, reaction_type, user_id)
        WHERE creator_token IS NULL;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_comment_reactions_unique_anonymous') THEN
        CREATE UNIQUE INDEX idx_comment_reactions_unique_anonymous
        ON comment_reactions(comment_id, reaction_type, creator_token)
        WHERE user_id IS NULL;
    END IF;
END $$;
