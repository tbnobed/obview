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
const { Pool } = require('@neondatabase/serverless');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
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
  echo "ERROR: Database migration failed"
  exit 1
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