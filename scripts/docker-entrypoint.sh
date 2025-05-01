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

# Create dist directories if they don't exist
mkdir -p /app/dist/server

# Check if the application server file exists
if [ ! -f "/app/dist/server/index.js" ]; then
  # If dist/server/index.js doesn't exist, try to build it
  echo "WARNING: Application server file not found at /app/dist/server/index.js"
  echo "Attempting to build server from source..."
  
  # Check if we have the necessary source files
  if [ -d "/app/server" ] && [ -f "/app/server/index.ts" ]; then
    echo "Found server source files. Attempting to compile..."
    # Try to build using TypeScript's tsc command directly
    npx tsc --project /app/tsconfig.json || echo "TypeScript compilation failed"
    
    # Try to use build script from package.json
    npm run build || echo "npm build script failed"
  else
    echo "Source files not found. Checking for alternate server start methods..."
  fi
  
  # List available files to help with debugging
  echo "Contents of /app directory:"
  ls -la /app
  echo "Contents of /app/server directory (if it exists):"
  ls -la /app/server || echo "Server directory not found"
  echo "Contents of /app/dist directory (if it exists):"
  ls -la /app/dist || echo "Dist directory not found"
  
  # Look for alternative entry points
  if [ -f "/app/server/index.js" ]; then
    echo "Found a server entry point at /app/server/index.js"
    echo "Will use node /app/server/index.js as fallback"
    # Set an environment variable for the CMD to use
    export SERVER_ENTRY="/app/server/index.js"
  else
    echo "ERROR: No usable server entry point found. Docker build may be incomplete."
    exit 1
  fi
fi

# Start the application
echo "Starting the application..."
exec "$@"