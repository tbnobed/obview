
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
run_migrations() {
  local success=0
  
  if [ -f "/app/server/db-migrate.cjs" ]; then
    echo "Found db-migrate.cjs, running migrations..."
    node /app/server/db-migrate.cjs || success=1
  elif [ -f "/app/server/db-migrate.js" ]; then
    echo "Found db-migrate.js, running migrations..."
    node /app/server/db-migrate.js || success=1
  else
    echo "Migration file not found. Checking for alternate locations..."
    success=1
  fi
  
  # Apply any SQL migrations directly if they exist
  if [ -d "/app/migrations" ]; then
    echo "Found SQL migrations directory, applying SQL migrations..."
    for migration in /app/migrations/*.sql; do
      if [ -f "$migration" ]; then
        echo "Applying SQL migration: $migration"
        # Parse DATABASE_URL to extract credentials
        DB_HOST=$(echo $DATABASE_URL | sed -E 's/.*@([^:]+)(:[0-9]+)?\/.*/\1/')
        DB_PORT=$(echo $DATABASE_URL | sed -E 's/.*:([0-9]+)\/.*/\1/')
        DB_NAME=$(echo $DATABASE_URL | sed -E 's/.*\/([^?]+).*/\1/')
        DB_USER=$(echo $DATABASE_URL | sed -E 's/.*:\/\/([^:]+):.*/\1/')
        DB_PASS=$(echo $DATABASE_URL | sed -E 's/.*:\/\/[^:]+:([^@]+).*/\1/')
        
        # Execute the SQL file using psql
        PGPASSWORD=$DB_PASS psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f $migration || {
          echo "Warning: SQL migration $migration encountered issues."
          echo "This might be normal if the changes already exist. Continuing..."
        }
      fi
    done
  fi
  
  echo "Database migration process completed."
}

run_migrations

# Create admin user with error handling
echo "Setting up admin user if needed..."
if [ -f "/app/scripts/setup.cjs" ]; then
  node /app/scripts/setup.cjs || {
    echo "Warning: Admin user setup encountered issues."
    echo "This might be normal if the user already exists. Continuing..."
  }
elif [ -f "/app/scripts/setup.js" ]; then
  node /app/scripts/setup.js || {
    echo "Warning: Admin user setup encountered issues."
    echo "This might be normal if the user already exists. Continuing..."
  }
else
  echo "Setup script not found. This might cause issues if no admin user exists."
fi

# Create required directories with proper permissions
mkdir -p /app/dist/server
mkdir -p /app/uploads/processed

# Ensure proper permissions for file operations
chown -R $(whoami):$(whoami) /app/uploads 2>/dev/null || true
chmod -R 755 /app/uploads

# Verify filesystem utilities are available for cleanup operations
echo "Verifying filesystem utilities for admin cleanup operations..."
if [ ! -d "/app/uploads" ]; then
  echo "Warning: Upload directory not found at /app/uploads"
fi

# Test write permissions
touch /app/uploads/.test_write 2>/dev/null && rm -f /app/uploads/.test_write && echo "✅ Upload directory write permissions verified" || echo "⚠️  Warning: Upload directory may not be writable"

# Find a valid entry point for the server - prefer built JS over TypeScript source  
find_server_entry() {
  # First priority: built server file from npm run build (check the file the build actually creates)
  if [ -f "/app/dist/index.js" ]; then
    echo "Found built server entry point: /app/dist/index.js"
    export SERVER_ENTRY="/app/dist/index.js"
    return 0
  elif [ -f "/app/dist/server/index.js" ]; then
    echo "Found built server entry point: /app/dist/server/index.js"
    export SERVER_ENTRY="/app/dist/server/index.js"
    return 0
  # Second priority: JS source files
  elif [ -f "/app/server/index.js" ]; then
    echo "Found JavaScript source entry point: /app/server/index.js"
    export SERVER_ENTRY="/app/server/index.js"
    return 0
  # For TypeScript fallback, don't set SERVER_ENTRY - let CMD handle it
  elif [ -f "/app/server/index.ts" ]; then
    echo "TypeScript source found. Letting CMD handle the tsx fallback..."
    unset SERVER_ENTRY
    return 1
  else
    return 1
  fi
}

# Check for existing build files
find_server_entry || echo "No built JavaScript files found. CMD will use tsx fallback."

# Start the application
echo "Starting the application..."
exec "$@"