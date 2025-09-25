-- Migration 0009: Add parent_id column to public_comments table
-- This migration adds the missing parent_id column for comment reply functionality

-- Add parent_id column to public_comments table (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'public_comments' AND column_name = 'parent_id'
    ) THEN
        ALTER TABLE public_comments ADD COLUMN parent_id INTEGER;
    END IF;
END $$;

-- Create index for better performance on parent_id lookups
CREATE INDEX IF NOT EXISTS idx_public_comments_parent_id ON public_comments(parent_id);

-- Add foreign key constraint for parent_id to reference the same table (self-referencing)
DO $$
BEGIN
    -- Check if the constraint doesn't already exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'public_comments_parent_id_fkey' 
        AND table_name = 'public_comments'
    ) THEN
        ALTER TABLE public_comments ADD CONSTRAINT public_comments_parent_id_fkey 
        FOREIGN KEY (parent_id) REFERENCES public_comments(id) ON DELETE CASCADE;
    END IF;
END $$;