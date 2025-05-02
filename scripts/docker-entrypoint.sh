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
if [ -f "/app/server/db-migrate.cjs" ]; then
  node /app/server/db-migrate.cjs || {
    echo "Warning: Database migrations encountered issues."
    echo "This might be normal if tables already exist. Continuing..."
  }
elif [ -f "/app/server/db-migrate.js" ]; then
  node /app/server/db-migrate.js || {
    echo "Warning: Database migrations encountered issues."
    echo "This might be normal if tables already exist. Continuing..."
  }
else
  echo "Migration file not found. Checking for alternate locations..."
  # Try to run the migration directly using the drizzle-kit
  npx drizzle-kit migrate:mysql --config=drizzle.config.ts || {
    echo "Warning: Drizzle-kit migration encountered issues."
    echo "This might be normal if tables already exist. Continuing..."
  }
fi

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

# Create required directories
mkdir -p /app/dist/server
mkdir -p /app/uploads

# Build the server files if they don't exist
build_server_from_source() {
  echo "Attempting to build server from source..."
  
  if [ -d "/app/server" ] && [ -f "/app/server/index.ts" ]; then
    echo "Found server source files. Attempting to compile..."
    
    # Try the npm build script first
    echo "Running npm build script..."
    npm run build && echo "Build successful!" && return 0
    
    # Fallback to manual TypeScript compilation
    echo "npm build failed, trying direct TypeScript compilation..."
    npx tsc --project /app/tsconfig.json && echo "TypeScript compilation successful!" && return 0
    
    echo "TypeScript compilation also failed. Trying esbuild directly..."
    npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist && \
      echo "esbuild compilation successful!" && return 0
      
    return 1
  else
    echo "Source files not found." 
    return 1
  fi
}

# Find a valid entry point for the server
find_server_entry() {
  # Check for built server entry points in priority order
  if [ -f "/app/dist/server/index.js" ]; then
    echo "Found primary entry point: /app/dist/server/index.js"
    export SERVER_ENTRY="/app/dist/server/index.js"
    return 0
  elif [ -f "/app/dist/index.js" ]; then
    echo "Found secondary entry point: /app/dist/index.js"
    export SERVER_ENTRY="/app/dist/index.js"
    return 0
  elif [ -f "/app/server/index.js" ]; then
    echo "Found server source entry point: /app/server/index.js"
    export SERVER_ENTRY="/app/server/index.js"
    return 0
  else
    # If no JS entry points found, look for TypeScript source as last resort
    if [ -f "/app/server/index.ts" ]; then
      echo "Found TypeScript source: /app/server/index.ts"
      export SERVER_ENTRY="tsx /app/server/index.ts"
      return 0
    fi
    return 1
  fi
}

# Diagnose system and application status
diagnose_system() {
  echo "=== System Diagnosis ==="
  echo "Node version: $(node -v)"
  echo "NPM version: $(npm -v)"
  echo "Environment: $NODE_ENV"
  echo "IS_DOCKER: $IS_DOCKER"
  
  echo "=== Directory Structure ==="
  echo "Contents of /app directory:"
  ls -la /app
  
  if [ -d "/app/server" ]; then
    echo "Contents of /app/server directory:"
    ls -la /app/server
  else
    echo "Server directory not found!"
  fi
  
  if [ -d "/app/dist" ]; then
    echo "Contents of /app/dist directory:"
    ls -la /app/dist
    
    if [ -d "/app/dist/server" ]; then
      echo "Contents of /app/dist/server directory:"
      ls -la /app/dist/server
    fi
  else
    echo "Dist directory not found!"
  fi
  
  echo "=== Package.json Validation ==="
  if [ -f "/app/package.json" ]; then
    echo "package.json found. Checking build script:"
    grep '"build"' /app/package.json
  else
    echo "package.json not found!"
  fi
}

# Main execution logic
echo "Starting OBview.io application initialization..."

# Check for existing build files
if ! find_server_entry; then
  echo "WARNING: No server entry point found."
  diagnose_system
  
  echo "Attempting to build server from source..."
  if build_server_from_source; then
    echo "Build successful. Searching for entry point again..."
    if ! find_server_entry; then
      echo "ERROR: Still no valid entry point found after build"
      diagnose_system
      echo "Will try to run using fallback methods in the CMD..."
    fi
  else
    echo "ERROR: Failed to build server from source"
    diagnose_system
    echo "Will try to run using fallback methods in the CMD..."
  fi
fi

# Start the application
echo "Starting the application..."
exec "$@"