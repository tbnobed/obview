-- Migration 0010: Fix public_comments foreign key constraint to allow cross-table replies
-- This migration removes the self-referencing constraint that prevents public comments from replying to authenticated comments

-- Remove the problematic self-referencing foreign key constraint
-- This constraint was blocking cross-table replies (public comments replying to authenticated comments)
DO $$
BEGIN
    -- Check if the constraint exists and remove it
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'public_comments_parent_id_fkey' 
        AND table_name = 'public_comments'
    ) THEN
        ALTER TABLE public_comments DROP CONSTRAINT public_comments_parent_id_fkey;
        RAISE NOTICE 'Removed public_comments_parent_id_fkey constraint to allow cross-table replies';
    ELSE
        RAISE NOTICE 'public_comments_parent_id_fkey constraint not found, no action needed';
    END IF;
END $$;

-- Keep the performance index for parent_id lookups
-- This index was correctly added and should remain
CREATE INDEX IF NOT EXISTS idx_public_comments_parent_id ON public_comments(parent_id);