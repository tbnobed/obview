-- Complete schema initialization for fresh Docker deployments
-- This ensures all tables are created including the unified comment system

-- Users table
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

-- Folders table (needed before projects due to foreign key)
CREATE TABLE IF NOT EXISTS folders (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT DEFAULT '#6366f1',
    created_by_id INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Projects table (with folder support)
CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'in_progress',
    folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL,
    created_by_id INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Files table
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

-- Comments table (legacy)
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

-- Public comments table (legacy)
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

-- Unified comments table (replaces comments + public_comments)
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
    annotations TEXT,
    is_resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Comment reactions table
CREATE TABLE IF NOT EXISTS comment_reactions (
    id SERIAL PRIMARY KEY,
    comment_id TEXT NOT NULL,
    user_id INTEGER,
    creator_token TEXT,
    reaction_type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Project users table
CREATE TABLE IF NOT EXISTS project_users (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Recent projects (per-user history of opened projects, powers sidebar Recent list)
CREATE TABLE IF NOT EXISTS recent_projects (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, project_id)
);
CREATE INDEX IF NOT EXISTS recent_projects_user_opened_idx
    ON recent_projects (user_id, opened_at DESC);

-- Activity logs table
CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    metadata JSON,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Invitations table
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
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Approvals table
CREATE TABLE IF NOT EXISTS approvals (
    id SERIAL PRIMARY KEY,
    file_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    feedback TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Password resets table
CREATE TABLE IF NOT EXISTS password_resets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    is_used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Video processing table
CREATE TABLE IF NOT EXISTS video_processing (
    id SERIAL PRIMARY KEY,
    file_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    qualities JSON,
    scrub_version_path TEXT,
    thumbnail_sprite_path TEXT,
    sprite_metadata JSON,
    duration INTEGER,
    frame_rate INTEGER,
    error_message TEXT,
    processed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add foreign key constraints
DO $$
BEGIN
    -- Folders foreign keys
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'folders_created_by_id_fkey' 
        AND table_name = 'folders'
    ) THEN
        ALTER TABLE folders ADD CONSTRAINT folders_created_by_id_fkey 
        FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
    
    -- Projects foreign keys
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'projects_created_by_id_fkey' 
        AND table_name = 'projects'
    ) THEN
        ALTER TABLE projects ADD CONSTRAINT projects_created_by_id_fkey 
        FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
    
    -- Files foreign keys
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'files_project_id_fkey' 
        AND table_name = 'files'
    ) THEN
        ALTER TABLE files ADD CONSTRAINT files_project_id_fkey 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'files_uploaded_by_id_fkey' 
        AND table_name = 'files'
    ) THEN
        ALTER TABLE files ADD CONSTRAINT files_uploaded_by_id_fkey 
        FOREIGN KEY (uploaded_by_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
    
    -- Comments foreign keys (legacy)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'comments_file_id_fkey' 
        AND table_name = 'comments'
    ) THEN
        ALTER TABLE comments ADD CONSTRAINT comments_file_id_fkey 
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'comments_user_id_fkey' 
        AND table_name = 'comments'
    ) THEN
        ALTER TABLE comments ADD CONSTRAINT comments_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'comments_parent_id_fkey' 
        AND table_name = 'comments'
    ) THEN
        ALTER TABLE comments ADD CONSTRAINT comments_parent_id_fkey 
        FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE;
    END IF;

    -- Unified comments foreign keys
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_comments_unified_file_id' 
        AND table_name = 'comments_unified'
    ) THEN
        ALTER TABLE comments_unified ADD CONSTRAINT fk_comments_unified_file_id 
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_comments_unified_user_id' 
        AND table_name = 'comments_unified'
    ) THEN
        ALTER TABLE comments_unified ADD CONSTRAINT fk_comments_unified_user_id 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_comments_unified_parent_id' 
        AND table_name = 'comments_unified'
    ) THEN
        ALTER TABLE comments_unified ADD CONSTRAINT fk_comments_unified_parent_id 
        FOREIGN KEY (parent_id) REFERENCES comments_unified(id) ON DELETE SET NULL;
    END IF;

    -- Comment reactions foreign keys
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_comment_reactions_comment_id' 
        AND table_name = 'comment_reactions'
    ) THEN
        ALTER TABLE comment_reactions ADD CONSTRAINT fk_comment_reactions_comment_id 
        FOREIGN KEY (comment_id) REFERENCES comments_unified(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_comment_reactions_user_id' 
        AND table_name = 'comment_reactions'
    ) THEN
        ALTER TABLE comment_reactions ADD CONSTRAINT fk_comment_reactions_user_id 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;

    -- Invitations foreign keys
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'invitations_project_id_fkey' 
        AND table_name = 'invitations'
    ) THEN
        ALTER TABLE invitations ADD CONSTRAINT invitations_project_id_fkey 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'invitations_created_by_id_fkey' 
        AND table_name = 'invitations'
    ) THEN
        ALTER TABLE invitations ADD CONSTRAINT invitations_created_by_id_fkey 
        FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;

    -- Password resets foreign keys
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'password_resets_user_id_fkey' 
        AND table_name = 'password_resets'
    ) THEN
        ALTER TABLE password_resets ADD CONSTRAINT password_resets_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
    
    -- Video processing foreign keys
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'video_processing_file_id_fkey' 
        AND table_name = 'video_processing'
    ) THEN
        ALTER TABLE video_processing ADD CONSTRAINT video_processing_file_id_fkey 
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_folders_created_by_id ON folders(created_by_id);
CREATE INDEX IF NOT EXISTS idx_folders_name ON folders(name);
CREATE INDEX IF NOT EXISTS idx_projects_folder_id ON projects(folder_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_by_id ON projects(created_by_id);
CREATE INDEX IF NOT EXISTS idx_files_project_id ON files(project_id);
CREATE INDEX IF NOT EXISTS idx_files_uploaded_by_id ON files(uploaded_by_id);
CREATE INDEX IF NOT EXISTS idx_comments_file_id ON comments(file_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_unified_file_id ON comments_unified(file_id);
CREATE INDEX IF NOT EXISTS idx_comments_unified_user_id ON comments_unified(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_unified_parent_id ON comments_unified(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_unified_file_timestamp ON comments_unified(file_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_id ON comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment_reaction ON comment_reactions(comment_id, reaction_type);
CREATE INDEX IF NOT EXISTS idx_video_processing_file_id ON video_processing(file_id);
CREATE INDEX IF NOT EXISTS idx_video_processing_status ON video_processing(status);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token);
CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);

-- Unique indexes for comment reactions
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_comment_reactions_unique_user') THEN
        CREATE UNIQUE INDEX idx_comment_reactions_unique_user 
        ON comment_reactions(comment_id, reaction_type, user_id) 
        WHERE creator_token IS NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_comment_reactions_unique_anonymous') THEN
        CREATE UNIQUE INDEX idx_comment_reactions_unique_anonymous 
        ON comment_reactions(comment_id, reaction_type, creator_token) 
        WHERE user_id IS NULL;
    END IF;
END $$;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
