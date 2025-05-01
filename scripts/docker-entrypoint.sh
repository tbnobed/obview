#!/bin/sh
set -e

# Ensure IS_DOCKER environment variable is set
export IS_DOCKER=true

# Wait for database to be ready
echo "Waiting for database to be ready..."
/app/scripts/wait-for-db.sh || {
  echo "Database connection failed. Check your connection parameters."
  exit 1
}

# Run migrations with error handling
echo "Running database migrations..."
node /app/server/db-migrate.cjs || {
  echo "Warning: Database migrations encountered issues."
  echo "This might be normal if tables already exist. Continuing..."
}

# Create admin user with error handling
echo "Setting up admin user if needed..."
node /app/scripts/setup.cjs || {
  echo "Warning: Admin user setup encountered issues."
  echo "This might be normal if the user already exists. Continuing..."
}

# Check if the application server file exists
if [ ! -f "/app/dist/server/index.js" ]; then
  echo "ERROR: Application server file not found. Build may have failed."
  echo "Expected file: /app/dist/server/index.js"
  ls -la /app/dist/server || echo "Server directory does not exist"
  exit 1
fi

# Start the application
echo "Starting the application..."
exec "$@"