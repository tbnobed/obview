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
/app/scripts/wait-for-db.sh

# Check database connection
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

# Run migrations
echo "Running database migrations..."
if ! node /app/dist/server/db-migrate.js; then
  echo "WARNING: Database migration script failed. This could be due to missing /app/drizzle directory."
  echo "Attempting to generate migration files..."
  
  # Try to generate migration files using drizzle-kit
  if command -v npx &> /dev/null; then
    echo "Generating migration files with Drizzle Kit..."
    cd /app && npx drizzle-kit generate:pg || echo "Failed to generate migration files."
  else
    echo "npx not found, skipping migration generation."
  fi
  
  # Try to run migrations again
  echo "Retrying database migration..."
  if ! node /app/dist/server/db-migrate.js; then
    echo "ERROR: Database migration failed after retry."
    echo "You may need to manually run migrations or check database structure."
    # We continue despite error since the schema might be already up to date
  fi
fi

# Create admin user if not exists
echo "Setting up admin user if needed..."
if ! node /app/scripts/setup.js; then
  echo "ERROR: Admin user setup failed"
  exit 1
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

# Start the application
exec "$@"