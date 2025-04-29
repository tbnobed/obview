#!/bin/sh
set -e

# Function to handle errors
handle_error() {
  echo "ERROR: An error occurred during startup at line $1"
  exit 1
}

# Set up error handling
trap 'handle_error $LINENO' ERR

# Check for required environment variables
echo "Checking environment configuration..."
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable is not set"
  exit 1
fi

if [ -z "$SESSION_SECRET" ]; then
  echo "WARNING: SESSION_SECRET environment variable is not set. Using a default value (not recommended for production)"
  export SESSION_SECRET="obview-default-session-secret-$(date +%s)"
fi

# Create uploads directory if it doesn't exist
mkdir -p /app/uploads
chmod 755 /app/uploads

# Wait for database to be ready
echo "Waiting for database to be ready..."
MAX_RETRIES=60
RETRY=0

until PGPASSWORD=${POSTGRES_PASSWORD:-postgres} psql -h db -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-obview} -c "SELECT 1" > /dev/null 2>&1; do
  RETRY=$((RETRY+1))
  if [ $RETRY -ge $MAX_RETRIES ]; then
    echo "ERROR: Failed to connect to PostgreSQL after $MAX_RETRIES attempts"
    exit 1
  fi
  echo "PostgreSQL is unavailable - attempt $RETRY/$MAX_RETRIES - waiting for 2 seconds"
  sleep 2
done

echo "SUCCESS: PostgreSQL is up and running"
echo "Connection to db:5432 as ${POSTGRES_USER:-postgres} to database ${POSTGRES_DB:-obview} was successful"

# Check database connection with node
echo "Verifying database connection..."
if ! node -e "
const { Pool } = require('pg');
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 5000
});
pool.query('SELECT NOW()').then(res => {
  console.log('Database connection successful:', res.rows[0]);
  process.exit(0);
}).catch(err => {
  console.error('Database connection failed:', err);
  process.exit(1);
});
"; then
  echo "ERROR: Failed to connect to the database"
  exit 1
fi

# Create schema if needed
echo "Creating database schema directly..."
if ! PGPASSWORD=${POSTGRES_PASSWORD:-postgres} psql -h db -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-obview} -c "
-- Create tables if they don't exist
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    \"createdAt\" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    \"createdById\" INTEGER REFERENCES users(id),
    ownerId INTEGER REFERENCES users(id),
    \"createdAt\" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    \"updatedAt\" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_users (
    id SERIAL PRIMARY KEY,
    \"projectId\" INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    \"userId\" INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    \"createdAt\" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(\"projectId\", \"userId\")
);

CREATE TABLE IF NOT EXISTS files (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    \"fileType\" VARCHAR(50) NOT NULL,
    \"fileSize\" INTEGER NOT NULL,
    \"filePath\" VARCHAR(255) NOT NULL,
    \"projectId\" INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    \"uploadedById\" INTEGER REFERENCES users(id) ON DELETE SET NULL,
    version INTEGER DEFAULT 1,
    \"isLatestVersion\" BOOLEAN DEFAULT TRUE,
    \"createdAt\" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    \"fileId\" INTEGER REFERENCES files(id) ON DELETE CASCADE,
    \"userId\" INTEGER REFERENCES users(id) ON DELETE CASCADE,
    \"parentId\" INTEGER REFERENCES comments(id) ON DELETE CASCADE NULL,
    timestamp INTEGER NULL,
    \"isResolved\" BOOLEAN DEFAULT FALSE,
    \"createdAt\" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    \"activityType\" VARCHAR(50) NOT NULL,
    \"projectId\" INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    \"userId\" INTEGER REFERENCES users(id) ON DELETE CASCADE,
    \"entityId\" INTEGER,
    \"entityType\" VARCHAR(50),
    details JSONB,
    \"createdAt\" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invitations (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    \"projectId\" INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    \"invitedById\" INTEGER REFERENCES users(id) ON DELETE CASCADE,
    \"emailSent\" BOOLEAN DEFAULT FALSE,
    \"createdAt\" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS approvals (
    id SERIAL PRIMARY KEY,
    \"fileId\" INTEGER REFERENCES files(id) ON DELETE CASCADE,
    \"userId\" INTEGER REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    feedback TEXT NULL,
    \"createdAt\" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(\"fileId\", \"userId\")
);

-- Create session table for PostgreSQL session store
CREATE TABLE IF NOT EXISTS \"session\" (
    \"sid\" varchar NOT NULL COLLATE \"default\",
    \"sess\" json NOT NULL,
    \"expire\" timestamp(6) NOT NULL,
    CONSTRAINT \"session_pkey\" PRIMARY KEY (\"sid\")
);
CREATE INDEX IF NOT EXISTS \"IDX_session_expire\" ON \"session\" (\"expire\");

-- Create indexes for improved performance
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON projects(\"createdById\");
CREATE INDEX IF NOT EXISTS idx_projects_owner_id ON projects(ownerId);
CREATE INDEX IF NOT EXISTS idx_files_project ON files(\"projectId\");
CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files(\"uploadedById\");
CREATE INDEX IF NOT EXISTS idx_comments_file ON comments(\"fileId\");
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(\"userId\");
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(\"parentId\");
CREATE INDEX IF NOT EXISTS idx_activity_logs_project ON activity_logs(\"projectId\");
CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON activity_logs(\"userId\");
CREATE INDEX IF NOT EXISTS idx_invitations_project ON invitations(\"projectId\");
CREATE INDEX IF NOT EXISTS idx_invitations_invited_by ON invitations(\"invitedById\");
CREATE INDEX IF NOT EXISTS idx_approvals_file ON approvals(\"fileId\");
"; then
  echo "WARNING: Direct schema creation failed."
  echo "Proceeding anyway as the schema might already exist."
fi

# Create admin user if not exists
echo "Setting up admin user if needed..."
if ! PGPASSWORD=${POSTGRES_PASSWORD:-postgres} psql -h db -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-obview} -c "
  DO \$\$
  DECLARE
    user_exists BOOLEAN;
  BEGIN
    SELECT EXISTS(SELECT 1 FROM users WHERE username = 'admin') INTO user_exists;
    IF NOT user_exists THEN
      INSERT INTO users (username, password, email, name, role, \"createdAt\") 
      VALUES ('admin', 'a7b13d2b2b89eacba6e3d2c10b08f7d0cf5ba0a79d0b99d27e8912613f087d6bfe21ef50c43709a97269d9ff7c779e17adf12d2a6722a7e6d30b70a9d87e0bde.7c3cde42af095f81af3fc6c5a95bf273', 'admin@example.com', 'Administrator', 'admin', NOW());
      RAISE NOTICE 'Admin user created successfully';
    ELSE
      RAISE NOTICE 'Admin user already exists';
    END IF;
  END \$\$;
"; then
  echo "ERROR: Admin user setup failed with direct SQL"
  # We continue despite error since the user might be added in another way
fi

# Print startup information
echo ""
echo "==============================================="
echo "OBview.io is ready to start"
echo "==============================================="
echo "Version: $(node -e "console.log(require('/app/package.json').version || 'dev')")"
echo "Environment: $NODE_ENV"
echo "Database: Connected"
echo "Uploads directory: /app/uploads"
echo "-----------------------------------------------"
echo "Starting the application..."
echo "==============================================="
echo ""

# Check available built files and start appropriate entry point
if [ ! -f "/app/dist/server/index.js" ] && [ -f "/app/dist/index.js" ]; then
  echo "Using entry point: /app/dist/index.js"
  exec node /app/dist/index.js
elif [ -f "/app/dist/server/index.js" ]; then
  echo "Using entry point: /app/dist/server/index.js"
  exec node /app/dist/server/index.js
else
  echo "ERROR: Application entry point not found"
  echo "Available files in /app/dist:"
  find /app/dist -type f | sort
  exit 1
fi