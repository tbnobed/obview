-- Migration 0008: Add creator_token column to public_comments table
-- This migration adds the creator_token column for public comment deletion functionality

-- Add creator_token column to public_comments table (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'public_comments' AND column_name = 'creator_token'
    ) THEN
        ALTER TABLE public_comments ADD COLUMN creator_token TEXT;
    END IF;
END $$;

-- Create index for better performance on creator_token lookups
CREATE INDEX IF NOT EXISTS idx_public_comments_creator_token ON public_comments(creator_token);