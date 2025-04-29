-- OBview.io Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'user',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "createdById" INTEGER REFERENCES users(id) ON DELETE CASCADE,
  ownerid INTEGER GENERATED ALWAYS AS ("createdById") STORED
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects ("createdById");

-- Project users (collaborators)
CREATE TABLE IF NOT EXISTS project_users (
  id SERIAL PRIMARY KEY,
  "projectId" INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  "userId" INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'viewer',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("projectId", "userId")
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_project_users_project_id ON project_users ("projectId");
CREATE INDEX IF NOT EXISTS idx_project_users_user_id ON project_users ("userId");

-- Files table
CREATE TABLE IF NOT EXISTS files (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  filepath VARCHAR(255) NOT NULL,
  filetype VARCHAR(100),
  filesize INTEGER,
  "projectId" INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  "uploadedBy" INTEGER REFERENCES users(id),
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_files_project_id ON files ("projectId");
CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files ("uploadedBy");

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  "fileId" INTEGER REFERENCES files(id) ON DELETE CASCADE,
  "userId" INTEGER REFERENCES users(id),
  "parentId" INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  timestamp FLOAT,
  resolved BOOLEAN DEFAULT FALSE,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_comments_file_id ON comments ("fileId");
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments ("userId");
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments ("parentId");

-- Activity logs table
CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  "projectId" INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  "resourceId" INTEGER,
  "resourceType" VARCHAR(50),
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs ("userId");
CREATE INDEX IF NOT EXISTS idx_activity_logs_project_id ON activity_logs ("projectId");

-- Invitations table
CREATE TABLE IF NOT EXISTS invitations (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  "projectId" INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  role VARCHAR(50) DEFAULT 'viewer',
  status VARCHAR(50) DEFAULT 'pending',
  "acceptedBy" INTEGER REFERENCES users(id),
  "acceptedAt" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP WITH TIME ZONE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_invitations_project_id ON invitations ("projectId");
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations (token);

-- Approvals table
CREATE TABLE IF NOT EXISTS approvals (
  id SERIAL PRIMARY KEY,
  "fileId" INTEGER REFERENCES files(id) ON DELETE CASCADE,
  "userId" INTEGER REFERENCES users(id),
  status VARCHAR(50) NOT NULL,
  feedback TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP WITH TIME ZONE,
  UNIQUE("fileId", "userId")
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_approvals_file_id ON approvals ("fileId");
CREATE INDEX IF NOT EXISTS idx_approvals_user_id ON approvals ("userId");

-- Insert a default admin user (password is hashed)
INSERT INTO users (username, password, email, name, role)
VALUES (
  'admin', 
  'a7b13d2b2b89eacba6e3d2c10b08f7d0cf5ba0a79d0b99d27e8912613f087d6bfe21ef50c43709a97269d9ff7c779e17adf12d2a6722a7e6d30b70a9d87e0bde.7c3cde42af095f81af3fc6c5a95bf273', 
  'admin@obview.io', 
  'Administrator', 
  'admin'
) ON CONFLICT (username) DO NOTHING;