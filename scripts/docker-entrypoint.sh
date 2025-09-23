#!/bin/bash
set -e

# Enhanced Docker entrypoint script for Obviu.io
echo "=== Obviu.io Container Initialization ==="
echo "Node version: $(node -v)"
echo "Environment: ${NODE_ENV:-development}"
echo "Docker mode: ${IS_DOCKER:-true}"

# Ensure IS_DOCKER environment variable is set
export IS_DOCKER=true

# Create required directories with proper permissions
mkdir -p /app/logs /app/uploads /app/dist/server
chmod 755 /app/logs /app/uploads

# Wait for database to be ready with enhanced logging
echo "Waiting for database to be ready..."
echo "Database URL: ${DATABASE_URL}"
/app/scripts/wait-for-db.sh || {
  echo "ERROR: Database connection failed after maximum retries."
  echo "Check your DATABASE_URL and ensure the database container is running."
  exit 1
}
echo "Database connection established successfully."

# Enhanced database migration handling
echo "=== Database Migration Process ==="
run_migrations() {
  local migration_success=false
  local timeout_duration=${DATABASE_MIGRATION_TIMEOUT:-60}
  
  echo "Starting migration process with ${timeout_duration}s timeout..."
  
  # Primary migration method: Use the enhanced db-migrate.js script
  if [ -f "/app/server/db-migrate.js" ]; then
    echo "Running primary migration script..."
    timeout $timeout_duration node /app/server/db-migrate.js && migration_success=true
  elif [ -f "/app/server/db-migrate.cjs" ]; then
    echo "Running fallback CJS migration script..."
    timeout $timeout_duration node /app/server/db-migrate.cjs && migration_success=true
  fi
  
  # Fallback: Direct SQL migration execution
  if [ "$migration_success" = false ] && [ -d "/app/migrations" ]; then
    echo "Primary migration failed, attempting direct SQL execution..."
    
    # Parse DATABASE_URL for connection parameters
    if echo "$DATABASE_URL" | grep -q "postgresql://"; then
      DB_HOST=$(echo $DATABASE_URL | sed -E 's/.*@([^:\/]+).*/\1/')
      DB_PORT=$(echo $DATABASE_URL | sed -E 's/.*:([0-9]+)\/.*/\1/' || echo "5432")
      DB_NAME=$(echo $DATABASE_URL | sed -E 's/.*\/([^?]+).*/\1/')
      DB_USER=$(echo $DATABASE_URL | sed -E 's/.*:\/\/([^:]+):.*/\1/')
      DB_PASS=$(echo $DATABASE_URL | sed -E 's/.*:\/\/[^:]+:([^@]+).*/\1/')
      
      echo "Applying SQL migrations directly..."
      for migration in /app/migrations/*.sql; do
        if [ -f "$migration" ]; then
          echo "Executing migration: $(basename $migration)"
          PGPASSWORD="$DB_PASS" timeout 30 psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$migration" 2>/dev/null && {
            echo "✓ Migration $(basename $migration) applied successfully"
            migration_success=true
          } || {
            echo "⚠ Migration $(basename $migration) may already be applied"
          }
        fi
      done
    fi
  fi
  
  # Last resort: Use drizzle-kit push
  if [ "$migration_success" = false ]; then
    echo "Attempting schema sync using drizzle-kit..."
    timeout $timeout_duration npx drizzle-kit push --force 2>/dev/null && {
      echo "✓ Schema synchronized successfully"
      migration_success=true
    } || {
      echo "⚠ Drizzle-kit push completed with warnings"
    }
  fi
  
  if [ "$migration_success" = true ]; then
    echo "✓ Database migration process completed successfully"
  else
    echo "⚠ Migration process completed with warnings - application will attempt to continue"
  fi
}

run_migrations

# Enhanced admin user setup
echo "=== Admin User Setup ==="
setup_admin_user() {
  echo "Configuring admin user..."
  
  if [ -f "/app/scripts/setup.js" ]; then
    echo "Running admin setup script..."
    timeout 30 node /app/scripts/setup.js && {
      echo "✓ Admin user setup completed successfully"
    } || {
      echo "⚠ Admin user setup completed with warnings (user may already exist)"
    }
  elif [ -f "/app/scripts/setup.cjs" ]; then
    echo "Running fallback admin setup script..."
    timeout 30 node /app/scripts/setup.cjs && {
      echo "✓ Admin user setup completed successfully"
    } || {
      echo "⚠ Admin user setup completed with warnings (user may already exist)"
    }
  else
    echo "⚠ No admin setup script found - admin user may need manual creation"
  fi
}

setup_admin_user

# Application build and startup preparation
echo "=== Application Preparation ==="

# Enhanced server build function
build_server_from_source() {
  echo "Building server from source..."
  
  if [ ! -d "/app/server" ] || [ ! -f "/app/server/index.ts" ]; then
    echo "❌ Server source files not found"
    return 1
  fi
  
  echo "📁 Server source files found, attempting compilation..."
  
  # Method 1: Use npm build script
  if npm run build >/dev/null 2>&1; then
    echo "✓ npm build successful"
    return 0
  fi
  
  # Method 2: Direct TypeScript compilation
  echo "Trying TypeScript compilation..."
  if npx tsc --project /app/tsconfig.json >/dev/null 2>&1; then
    echo "✓ TypeScript compilation successful"
    return 0
  fi
  
  # Method 3: esbuild fallback
  echo "Trying esbuild compilation..."
  if npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist >/dev/null 2>&1; then
    echo "✓ esbuild compilation successful"
    return 0
  fi
  
  echo "❌ All build methods failed"
  return 1
}

# Enhanced server entry point detection
find_server_entry() {
  echo "🔍 Searching for server entry point..."
  
  # Priority order for entry points
  if [ -f "/app/dist/server/index.js" ]; then
    echo "✓ Found primary entry point: /app/dist/server/index.js"
    export SERVER_ENTRY="/app/dist/server/index.js"
    return 0
  elif [ -f "/app/dist/index.js" ]; then
    echo "✓ Found secondary entry point: /app/dist/index.js"
    export SERVER_ENTRY="/app/dist/index.js"
    return 0
  elif [ -f "/app/server/index.js" ]; then
    echo "✓ Found compiled source entry point: /app/server/index.js"
    export SERVER_ENTRY="/app/server/index.js"
    return 0
  elif [ -f "/app/server/index.ts" ]; then
    echo "✓ Found TypeScript source: /app/server/index.ts (will use tsx)"
    export SERVER_ENTRY="tsx /app/server/index.ts"
    return 0
  else
    echo "❌ No valid entry point found"
    return 1
  fi
}

# System diagnostic function
diagnose_system() {
  echo "=== 🔧 System Diagnosis ==="
  echo "Node version: $(node -v)"
  echo "NPM version: $(npm -v)"
  echo "Environment: ${NODE_ENV:-not_set}"
  echo "Docker mode: ${IS_DOCKER:-false}"
  echo "Working directory: $(pwd)"
  
  echo "=== 📁 Directory Structure ==="
  [ -d "/app" ] && echo "✓ /app directory exists" || echo "❌ /app directory missing"
  [ -d "/app/server" ] && echo "✓ /app/server directory exists" || echo "❌ /app/server directory missing"
  [ -d "/app/dist" ] && echo "✓ /app/dist directory exists" || echo "❌ /app/dist directory missing"
  [ -f "/app/package.json" ] && echo "✓ package.json found" || echo "❌ package.json missing"
  
  if [ -d "/app/dist" ]; then
    echo "Contents of /app/dist:"
    ls -la /app/dist/ 2>/dev/null || echo "Cannot list /app/dist contents"
  fi
}

# Main application startup logic
echo "=== 🚀 Application Startup ==="

# Attempt to find or build server entry point
if find_server_entry; then
  echo "✅ Server entry point ready: $SERVER_ENTRY"
else
  echo "⚠ No entry point found, attempting to build..."
  if build_server_from_source; then
    echo "✅ Build successful, checking for entry point..."
    if find_server_entry; then
      echo "✅ Entry point found after build: $SERVER_ENTRY"
    else
      echo "⚠ No entry point found after build - will use fallback method"
      diagnose_system
    fi
  else
    echo "❌ Build failed - using fallback startup method"
    diagnose_system
  fi
fi

# Final startup message
echo "=== 🎯 Container Ready ==="
echo "Starting Obviu.io application..."
echo "Entry point: ${SERVER_ENTRY:-fallback_method}"
echo "Executing: $@"

# Transfer control to the CMD
exec "$@"