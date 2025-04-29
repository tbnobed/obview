-- This script will be automatically executed when the PostgreSQL container starts
-- It's a way to set up initial database structure and users

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
    ownerId INTEGER NOT NULL REFERENCES users(id),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_users (
    id SERIAL PRIMARY KEY,
    projectId INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    userId INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(projectId, userId)
);

CREATE TABLE IF NOT EXISTS files (
    id SERIAL PRIMARY KEY,
    projectId INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    fileType VARCHAR(100) NOT NULL,
    fileSize INTEGER NOT NULL,
    filePath TEXT NOT NULL,
    uploadedById INTEGER NOT NULL REFERENCES users(id),
    version INTEGER DEFAULT 1,
    isLatestVersion BOOLEAN DEFAULT TRUE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    fileId INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    userId INTEGER NOT NULL REFERENCES users(id),
    parentId INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    timestamp INTEGER,
    isResolved BOOLEAN DEFAULT FALSE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    userId INTEGER NOT NULL REFERENCES users(id),
    projectId INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    fileId INTEGER REFERENCES files(id) ON DELETE CASCADE,
    action VARCHAR(255) NOT NULL,
    details JSONB,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invitations (
    id SERIAL PRIMARY KEY,
    projectId INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    emailSent BOOLEAN DEFAULT FALSE,
    expiresAt TIMESTAMP WITH TIME ZONE NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS approvals (
    id SERIAL PRIMARY KEY,
    fileId INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    userId INTEGER NOT NULL REFERENCES users(id),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    feedback TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(fileId, userId)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_projects_ownerId ON projects(ownerId);
CREATE INDEX IF NOT EXISTS idx_files_projectId ON files(projectId);
CREATE INDEX IF NOT EXISTS idx_comments_fileId ON comments(fileId);
CREATE INDEX IF NOT EXISTS idx_comments_parentId ON comments(parentId);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_activity_logs_userId ON activity_logs(userId);
CREATE INDEX IF NOT EXISTS idx_activity_logs_projectId ON activity_logs(projectId);
CREATE INDEX IF NOT EXISTS idx_project_users_projectId ON project_users(projectId);
CREATE INDEX IF NOT EXISTS idx_project_users_userId ON project_users(userId);

-- Add admin user if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE username = 'admin') THEN
    INSERT INTO users (username, password, email, name, role, "createdAt")
    VALUES (
      'admin',
      'a7b13d2b2b89eacba6e3d2c10b08f7d0cf5ba0a79d0b99d27e8912613f087d6bfe21ef50c43709a97269d9ff7c779e17adf12d2a6722a7e6d30b70a9d87e0bde.7c3cde42af095f81af3fc6c5a95bf273',
      'admin@example.com',
      'Administrator',
      'admin',
      NOW()
    );
    RAISE NOTICE 'Admin user created successfully';
  ELSE
    RAISE NOTICE 'Admin user already exists';
  END IF;
END $$;