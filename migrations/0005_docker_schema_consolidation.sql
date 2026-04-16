-- Docker Schema Consolidation Migration
-- This migration ensures all required tables and indexes exist for Docker deployment
-- Created for Obviu.io Docker build process
--
-- SAFETY NOTE (2026-04-16): All `DELETE FROM ...` orphan cleanup statements
-- were REMOVED from this migration. The previous version wrapped destructive
-- deletes and FK additions in a single DO block, which silently rolled back
-- the entire block when any single FK addition failed (e.g. on a missing
-- column). That left production DBs without foreign keys, and the destructive
-- cleanup block was a standing risk for real data loss on every restart.
-- Orphan cleanup, if ever needed, must be a separate, opt-in maintenance
-- script -- not part of automatic startup migrations.

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

-- Ensure accepted_by_id column exists on pre-existing invitations tables
-- (0000_smooth_whistler.sql created invitations without this column).
-- This MUST run before the FK that references it, or the FK add will error
-- and previously rolled back the entire consolidation block.
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS accepted_by_id INTEGER;

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

-- Helper: add_fk_if_missing
-- Each FK is added in its OWN DO block so that a failure in one does not
-- cause Postgres to roll back the others. We also verify both the referencing
-- column and the referenced table exist before attempting to add the FK.

-- projects.created_by_id -> users.id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_created_by_id_fkey')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='created_by_id')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='users') THEN
        ALTER TABLE projects ADD CONSTRAINT projects_created_by_id_fkey
            FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping projects_created_by_id_fkey: %', SQLERRM;
END $$;

-- files.project_id -> projects.id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'files_project_id_fkey')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='files' AND column_name='project_id')
       AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='projects') THEN
        ALTER TABLE files ADD CONSTRAINT files_project_id_fkey
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping files_project_id_fkey: %', SQLERRM;
END $$;

-- files.uploaded_by_id -> users.id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'files_uploaded_by_id_fkey')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='files' AND column_name='uploaded_by_id') THEN
        ALTER TABLE files ADD CONSTRAINT files_uploaded_by_id_fkey
            FOREIGN KEY (uploaded_by_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping files_uploaded_by_id_fkey: %', SQLERRM;
END $$;

-- comments.file_id -> files.id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_file_id_fkey')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comments' AND column_name='file_id') THEN
        ALTER TABLE comments ADD CONSTRAINT comments_file_id_fkey
            FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping comments_file_id_fkey: %', SQLERRM;
END $$;

-- comments.user_id -> users.id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_user_id_fkey')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comments' AND column_name='user_id') THEN
        ALTER TABLE comments ADD CONSTRAINT comments_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping comments_user_id_fkey: %', SQLERRM;
END $$;

-- comments.parent_id -> comments.id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_parent_id_fkey')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='comments' AND column_name='parent_id') THEN
        ALTER TABLE comments ADD CONSTRAINT comments_parent_id_fkey
            FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping comments_parent_id_fkey: %', SQLERRM;
END $$;

-- public_comments.file_id -> files.id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_comments_file_id_fkey')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='public_comments' AND column_name='file_id') THEN
        ALTER TABLE public_comments ADD CONSTRAINT public_comments_file_id_fkey
            FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping public_comments_file_id_fkey: %', SQLERRM;
END $$;

-- ----------------------------------------------------------------------
-- Self-healing orphan cleanup, restricted to junction/log/dependent rows.
-- These deletions are SAFE: they remove records that are meaningless
-- without their parent (e.g. an invitation to a deleted project, an
-- approval for a deleted file, a project membership for a deleted user).
--
-- We deliberately do NOT touch user-content tables (files, comments,
-- public_comments, projects, users) -- those require human review.
--
-- Why this lives here: without it, ADD CONSTRAINT silently no-ops
-- (caught by EXCEPTION below) and the DB stays without cascade
-- protection forever. This block makes the FK setup self-healing on
-- subsequent boots without touching real content.
-- ----------------------------------------------------------------------
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM project_users
    WHERE project_id IS NOT NULL AND project_id NOT IN (SELECT id FROM projects);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN RAISE NOTICE 'Pruned % orphan project_users (deleted projects)', deleted_count; END IF;

    DELETE FROM project_users
    WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN RAISE NOTICE 'Pruned % orphan project_users (deleted users)', deleted_count; END IF;

    DELETE FROM activity_logs
    WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN RAISE NOTICE 'Pruned % orphan activity_logs (deleted users)', deleted_count; END IF;

    DELETE FROM invitations
    WHERE project_id IS NOT NULL AND project_id NOT IN (SELECT id FROM projects);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN RAISE NOTICE 'Pruned % orphan invitations (deleted projects)', deleted_count; END IF;

    DELETE FROM invitations
    WHERE created_by_id IS NOT NULL AND created_by_id NOT IN (SELECT id FROM users);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN RAISE NOTICE 'Pruned % orphan invitations (deleted creators)', deleted_count; END IF;

    -- accepted_by_id is nullable and has ON DELETE SET NULL semantics,
    -- so just NULL it out instead of deleting the invitation record.
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invitations' AND column_name='accepted_by_id') THEN
        UPDATE invitations SET accepted_by_id = NULL
        WHERE accepted_by_id IS NOT NULL AND accepted_by_id NOT IN (SELECT id FROM users);
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        IF deleted_count > 0 THEN RAISE NOTICE 'Cleared % invitations.accepted_by_id pointing at deleted users', deleted_count; END IF;
    END IF;

    DELETE FROM approvals
    WHERE file_id IS NOT NULL AND file_id NOT IN (SELECT id FROM files);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN RAISE NOTICE 'Pruned % orphan approvals (deleted files)', deleted_count; END IF;

    DELETE FROM approvals
    WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN RAISE NOTICE 'Pruned % orphan approvals (deleted users)', deleted_count; END IF;

    DELETE FROM password_resets
    WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN RAISE NOTICE 'Pruned % orphan password_resets (deleted users)', deleted_count; END IF;

    -- Preserve user content: NULL the parent pointer rather than delete the comment.
    UPDATE public_comments SET parent_id = NULL
    WHERE parent_id IS NOT NULL AND parent_id NOT IN (SELECT id FROM public_comments);
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    IF deleted_count > 0 THEN RAISE NOTICE 'Cleared % public_comments.parent_id pointing at deleted parents', deleted_count; END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Orphan cleanup encountered an error (continuing): %', SQLERRM;
END $$;

-- project_users.project_id -> projects.id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_users_project_id_fkey')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_users' AND column_name='project_id') THEN
        ALTER TABLE project_users ADD CONSTRAINT project_users_project_id_fkey
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping project_users_project_id_fkey: %', SQLERRM;
END $$;

-- project_users.user_id -> users.id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_users_user_id_fkey')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='project_users' AND column_name='user_id') THEN
        ALTER TABLE project_users ADD CONSTRAINT project_users_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping project_users_user_id_fkey: %', SQLERRM;
END $$;

-- activity_logs.user_id -> users.id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_logs_user_id_fkey')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='activity_logs' AND column_name='user_id') THEN
        ALTER TABLE activity_logs ADD CONSTRAINT activity_logs_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping activity_logs_user_id_fkey: %', SQLERRM;
END $$;

-- invitations.project_id -> projects.id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitations_project_id_fkey')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invitations' AND column_name='project_id') THEN
        ALTER TABLE invitations ADD CONSTRAINT invitations_project_id_fkey
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping invitations_project_id_fkey: %', SQLERRM;
END $$;

-- invitations.created_by_id -> users.id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitations_created_by_id_fkey')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invitations' AND column_name='created_by_id') THEN
        ALTER TABLE invitations ADD CONSTRAINT invitations_created_by_id_fkey
            FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping invitations_created_by_id_fkey: %', SQLERRM;
END $$;

-- invitations.accepted_by_id -> users.id (column existence now guaranteed above)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invitations_accepted_by_id_fkey')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='invitations' AND column_name='accepted_by_id') THEN
        ALTER TABLE invitations ADD CONSTRAINT invitations_accepted_by_id_fkey
            FOREIGN KEY (accepted_by_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping invitations_accepted_by_id_fkey: %', SQLERRM;
END $$;

-- approvals.file_id -> files.id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'approvals_file_id_fkey')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='approvals' AND column_name='file_id') THEN
        ALTER TABLE approvals ADD CONSTRAINT approvals_file_id_fkey
            FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping approvals_file_id_fkey: %', SQLERRM;
END $$;

-- approvals.user_id -> users.id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'approvals_user_id_fkey')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='approvals' AND column_name='user_id') THEN
        ALTER TABLE approvals ADD CONSTRAINT approvals_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping approvals_user_id_fkey: %', SQLERRM;
END $$;

-- password_resets.user_id -> users.id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'password_resets_user_id_fkey')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='password_resets' AND column_name='user_id') THEN
        ALTER TABLE password_resets ADD CONSTRAINT password_resets_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping password_resets_user_id_fkey: %', SQLERRM;
END $$;

-- public_comments.parent_id -> public_comments.id
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'public_comments_parent_id_fkey')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='public_comments' AND column_name='parent_id') THEN
        ALTER TABLE public_comments ADD CONSTRAINT public_comments_parent_id_fkey
            FOREIGN KEY (parent_id) REFERENCES public_comments(id) ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping public_comments_parent_id_fkey: %', SQLERRM;
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
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_users_project_id_user_id_unique') THEN
        ALTER TABLE project_users ADD CONSTRAINT project_users_project_id_user_id_unique
        UNIQUE (project_id, user_id);
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'Skipping project_users unique constraint: %', SQLERRM;
END $$;
