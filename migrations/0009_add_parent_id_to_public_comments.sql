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

-- Before adding the self-referencing FK, NULL-out any parent_id that
-- points at a non-existent row. We intentionally do NOT delete the comment
-- itself -- preserving the comment as a top-level reply is far less
-- destructive than deleting user content.
UPDATE public_comments
SET parent_id = NULL
WHERE parent_id IS NOT NULL
  AND parent_id NOT IN (SELECT id FROM public_comments);

-- Add foreign key constraint for parent_id to reference the same table (self-referencing)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'public_comments_parent_id_fkey'
        AND table_name = 'public_comments'
    ) THEN
        ALTER TABLE public_comments ADD CONSTRAINT public_comments_parent_id_fkey
        FOREIGN KEY (parent_id) REFERENCES public_comments(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping public_comments_parent_id_fkey: %', SQLERRM;
END $$;