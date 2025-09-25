-- Docker Schema Consolidation Migration
-- This migration ensures all required tables and indexes exist for Docker deployment
-- Created for Obviu.io Docker build process

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create users table if not exists
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    theme_preference TEXT DEFAULT 'system',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create projects table if not exists
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'in_progress',
    created_by_id INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create files table if not exists with bigint file_size
CREATE TABLE IF NOT EXISTS files (
    id SERIAL PRIMARY KEY,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_path TEXT NOT NULL,
    project_id INTEGER NOT NULL,
    uploaded_by_id INTEGER NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    is_latest_version BOOLEAN NOT NULL DEFAULT true,
    is_available BOOLEAN NOT NULL DEFAULT true,
    share_token TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create comments table if not exists
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    file_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    parent_id INTEGER,
    timestamp INTEGER,
    is_resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create public_comments table if not exists
CREATE TABLE IF NOT EXISTS public_comments (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    file_id INTEGER NOT NULL,
    display_name TEXT NOT NULL,
    parent_id INTEGER,
    timestamp INTEGER,
    creator_token TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create project_users table if not exists
CREATE TABLE IF NOT EXISTS project_users (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create activity_logs table if not exists
CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    metadata JSON,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create invitations table if not exists
CREATE TABLE IF NOT EXISTS invitations (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    project_id INTEGER,
    role TEXT NOT NULL DEFAULT 'viewer',
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    is_accepted BOOLEAN NOT NULL DEFAULT false,
    email_sent BOOLEAN NOT NULL DEFAULT false,
    created_by_id INTEGER NOT NULL,
    accepted_by_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create approvals table if not exists
CREATE TABLE IF NOT EXISTS approvals (
    id SERIAL PRIMARY KEY,
    file_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    feedback TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create password_resets table if not exists
CREATE TABLE IF NOT EXISTS password_resets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add foreign key constraints if they don't exist
DO $$ 
BEGIN
    -- Clean up orphaned data that would violate foreign key constraints
    DELETE FROM files WHERE project_id NOT IN (SELECT id FROM projects);
    DELETE FROM comments WHERE file_id NOT IN (SELECT id FROM files);
    DELETE FROM comments WHERE parent_id IS NOT NULL AND parent_id NOT IN (SELECT id FROM comments);
    DELETE FROM public_comments WHERE file_id NOT IN (SELECT id FROM files);
    DELETE FROM approvals WHERE file_id NOT IN (SELECT id FROM files);
    DELETE FROM activity_logs WHERE user_id NOT IN (SELECT id FROM users);
    DELETE FROM project_users WHERE project_id NOT IN (SELECT id FROM projects) OR user_id NOT IN (SELECT id FROM users);
    DELETE FROM invitations WHERE project_id IS NOT NULL AND project_id NOT IN (SELECT id FROM projects);
    DELETE FROM invitations WHERE created_by_id NOT IN (SELECT id FROM users);
    DELETE FROM password_resets WHERE user_id NOT IN (SELECT id FROM users);
    -- Projects foreign keys
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_created_by_id_fkey') THEN
        ALTER TABLE projects ADD CONSTRAINT projects_created_by_id_fkey 
        FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;

    -- Files foreign keys
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'files_project_id_fkey') THEN
        ALTER TABLE files ADD CONSTRAINT files_project_id_fkey 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'files_uploaded_by_id_fkey') THEN
        ALTER TABLE files ADD CONSTRAINT files_uploaded_by_id_fkey 
        FOREIGN KEY (uploaded_by_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;

    -- Comments foreign keys
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_file_id_fkey') THEN
        ALTER TABLE comments ADD CONSTRAINT comments_file_id_fkey 
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_user_id_fkey') THEN
        ALTER TABLE comments ADD CONSTRAINT comments_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_parent_id_fkey') THEN
        ALTER TABLE comments ADD CONSTRAINT comments_parent_id_fkey 
        FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE;
    END IF;

    -- Public comments foreign keys
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_comments_file_id_fkey') THEN
        ALTER TABLE public_comments ADD CONSTRAINT public_comments_file_id_fkey 
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE;
    END IF;

    -- Project users foreign keys
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_users_project_id_fkey') THEN
        ALTER TABLE project_users ADD CONSTRAINT project_users_project_id_fkey 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_users_user_id_fkey') THEN
        ALTER TABLE project_users ADD CONSTRAINT project_users_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;

    -- Activity logs foreign keys
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_logs_user_id_fkey') THEN
        ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;

    -- Invitations foreign keys
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitations_project_id_fkey') THEN
        ALTER TABLE invitations ADD CONSTRAINT invitations_project_id_fkey 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitations_created_by_id_fkey') THEN
        ALTER TABLE invitations ADD CONSTRAINT invitations_created_by_id_fkey 
        FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitations_accepted_by_id_fkey') THEN
        ALTER TABLE invitations ADD CONSTRAINT invitations_accepted_by_id_fkey 
        FOREIGN KEY (accepted_by_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    -- Approvals foreign keys
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'approvals_file_id_fkey') THEN
        ALTER TABLE approvals ADD CONSTRAINT approvals_file_id_fkey 
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'approvals_user_id_fkey') THEN
        ALTER TABLE approvals ADD CONSTRAINT approvals_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;

    -- Password resets foreign keys
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'password_resets_user_id_fkey') THEN
        ALTER TABLE password_resets ADD CONSTRAINT password_resets_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;

    -- Public comments foreign keys
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_comments_parent_id_fkey') THEN
        ALTER TABLE public_comments ADD CONSTRAINT public_comments_parent_id_fkey 
        FOREIGN KEY (parent_id) REFERENCES public_comments(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_files_project_id ON files(project_id);
CREATE INDEX IF NOT EXISTS idx_files_share_token ON files(share_token);
CREATE INDEX IF NOT EXISTS idx_files_is_latest_version ON files(is_latest_version);
CREATE INDEX IF NOT EXISTS idx_comments_file_id ON comments(file_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_timestamp ON comments(timestamp);
CREATE INDEX IF NOT EXISTS idx_public_comments_file_id ON public_comments(file_id);
CREATE INDEX IF NOT EXISTS idx_public_comments_parent_id ON public_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_public_comments_creator_token ON public_comments(creator_token);
CREATE INDEX IF NOT EXISTS idx_project_users_project_id ON project_users(project_id);
CREATE INDEX IF NOT EXISTS idx_project_users_user_id ON project_users(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity_type_id ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_approvals_file_id ON approvals(file_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);
CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);

-- Update file_size column to BIGINT if it's still INTEGER
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'files' 
        AND column_name = 'file_size' 
        AND data_type = 'integer'
    ) THEN
        ALTER TABLE files ALTER COLUMN file_size TYPE BIGINT;
    END IF;
END $$;

-- Create unique constraints
DO $$
BEGIN
    -- Ensure unique constraint on project_users
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_users_project_id_user_id_unique') THEN
        ALTER TABLE project_users ADD CONSTRAINT project_users_project_id_user_id_unique 
        UNIQUE (project_id, user_id);
    END IF;
END $$;

-- Log migration completion
INSERT INTO activity_logs (action, entity_type, entity_id, user_id, metadata, created_at)
SELECT 'migration', 'system', 0, 1, '{"migration": "0005_docker_schema_consolidation", "description": "Docker schema consolidation completed"}', NOW()
WHERE EXISTS (SELECT 1 FROM users WHERE id = 1)
ON CONFLICT DO NOTHING;