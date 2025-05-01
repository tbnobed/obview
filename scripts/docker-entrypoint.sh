#!/bin/sh
set -e

# Wait for database to be ready
echo "Waiting for database to be ready..."
/app/scripts/wait-for-db.sh

# Run migrations
echo "Running database migrations..."
node /app/server/db-migrate.cjs

# Create admin user if not exists
echo "Setting up admin user if needed..."
node /app/scripts/setup.js

# Start the application
echo "Starting the application..."
exec "$@"