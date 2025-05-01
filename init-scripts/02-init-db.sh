#!/bin/bash
set -e

# Run Drizzle migrations first
echo "Running database migrations..."
cd /app
node -e "require('./dist/server/db-migrate.js').runMigrations()"

# Create admin user if not exists
echo "Setting up admin user..."
node scripts/setup.js

echo "Database initialization completed successfully!"