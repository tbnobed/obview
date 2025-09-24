-- Migration 0007: Add folders support for project organization
-- This migration adds the folders table and updates projects table to support folder organization

-- Create folders table
CREATE TABLE IF NOT EXISTS folders (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#6366f1',
    created_by_id INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add folder_id column to projects table (if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'projects' AND column_name = 'folder_id'
    ) THEN
        ALTER TABLE projects ADD COLUMN folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_folders_created_by_id ON folders(created_by_id);
CREATE INDEX IF NOT EXISTS idx_folders_name ON folders(name);
CREATE INDEX IF NOT EXISTS idx_projects_folder_id ON projects(folder_id);

-- Add foreign key constraint for created_by_id if users table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        -- Check if the constraint doesn't already exist
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'folders_created_by_id_fkey' 
            AND table_name = 'folders'
        ) THEN
            ALTER TABLE folders ADD CONSTRAINT folders_created_by_id_fkey 
            FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;