#!/bin/bash
set -e

# Set Docker environment flag
export IS_DOCKER=true

echo "Starting database initialization..."

# Check if /app directory exists (container might run this outside of app context)
if [ -d "/app" ]; then
  cd /app
  
  # Run migrations using .cjs files for compatibility
  if [ -f "server/db-migrate.cjs" ]; then
    echo "Running database migrations with db-migrate.cjs..."
    node server/db-migrate.cjs || echo "Migrations encountered errors (tables may already exist)"
  elif [ -f "dist/server/db-migrate.cjs" ]; then
    echo "Running database migrations with dist version..."
    node dist/server/db-migrate.cjs || echo "Migrations encountered errors (tables may already exist)"
  else
    echo "Warning: Migration script not found. Tables may need to be created separately."
  fi
  
  # Create admin user if not exists
  if [ -f "scripts/setup.cjs" ]; then
    echo "Setting up admin user with setup.cjs..."
    node scripts/setup.cjs || echo "Admin user setup encountered errors (user may already exist)"
  else 
    echo "Warning: Setup script not found. Admin user may need to be created manually."
  fi
else
  echo "Warning: /app directory not found. This script is meant to run within the application container."
fi

echo "Database initialization process completed!"