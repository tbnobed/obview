-- Enable pgcrypto extension for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create tables if they don't exist
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER REFERENCES users(id) ON DELETE CASCADE,
    -- Add this for backward compatibility with old scripts
    ownerId INTEGER GENERATED ALWAYS AS ("createdById") STORED
);

CREATE TABLE IF NOT EXISTS project_users (
    id SERIAL PRIMARY KEY,
    "projectId" INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    "userId" INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("projectId", "userId")
);

CREATE TABLE IF NOT EXISTS files (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    "fileType" VARCHAR(50) NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "filePath" VARCHAR(255) NOT NULL,
    "projectId" INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    "uploadedById" INTEGER REFERENCES users(id) ON DELETE SET NULL,
    version INTEGER DEFAULT 1,
    "isLatestVersion" BOOLEAN DEFAULT TRUE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    "fileId" INTEGER REFERENCES files(id) ON DELETE CASCADE,
    "userId" INTEGER REFERENCES users(id) ON DELETE CASCADE,
    "parentId" INTEGER REFERENCES comments(id) ON DELETE CASCADE NULL,
    timestamp INTEGER NULL,
    "isResolved" BOOLEAN DEFAULT FALSE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    "activityType" VARCHAR(50) NOT NULL,
    "projectId" INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    "userId" INTEGER REFERENCES users(id) ON DELETE CASCADE,
    "entityId" INTEGER,
    "entityType" VARCHAR(50),
    details JSONB,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invitations (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    "projectId" INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    "invitedById" INTEGER REFERENCES users(id) ON DELETE CASCADE,
    "emailSent" BOOLEAN DEFAULT FALSE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS approvals (
    id SERIAL PRIMARY KEY,
    "fileId" INTEGER REFERENCES files(id) ON DELETE CASCADE,
    "userId" INTEGER REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    feedback TEXT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("fileId", "userId")
);

-- Create session table for PostgreSQL session store
CREATE TABLE IF NOT EXISTS "session" (
    "sid" varchar NOT NULL COLLATE "default",
    "sess" json NOT NULL,
    "expire" timestamp(6) NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");

-- Create indexes for improved performance
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects("createdById");
CREATE INDEX IF NOT EXISTS idx_files_project ON files("projectId");
CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files("uploadedById");
CREATE INDEX IF NOT EXISTS idx_comments_file ON comments("fileId");
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments("userId");
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments("parentId");
CREATE INDEX IF NOT EXISTS idx_activity_logs_project ON activity_logs("projectId");
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs("userId");
CREATE INDEX IF NOT EXISTS idx_invitations_project ON invitations("projectId");
CREATE INDEX IF NOT EXISTS idx_invitations_invited_by ON invitations("invitedById");
CREATE INDEX IF NOT EXISTS idx_approvals_file ON approvals("fileId");

-- Create admin user if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin') THEN
    INSERT INTO users (username, password, email, name, role, "createdAt") 
    VALUES ('admin', 'a7b13d2b2b89eacba6e3d2c10b08f7d0cf5ba0a79d0b99d27e8912613f087d6bfe21ef50c43709a97269d9ff7c779e17adf12d2a6722a7e6d30b70a9d87e0bde.7c3cde42af095f81af3fc6c5a95bf273', 'admin@example.com', 'Administrator', 'admin', NOW());
    RAISE NOTICE 'Admin user created successfully';
  END IF;
END $$;