#!/bin/bash
# fix-docker-build.sh
#
# This script fixes common Docker build issues with the OBview.io application,
# particularly problems with missing drizzle directories and migration files.
#
# Run with --force-clean to perform a complete rebuild with clean cache.

set -e

echo "🔧 OBview.io Docker Build Fixer 🔧"
echo "=================================================="

# Detect if running in Docker container context
IN_CONTAINER=0
if [ -f "/.dockerenv" ]; then
  IN_CONTAINER=1
  echo "⚠️  Running inside a Docker container. Some operations may be limited."
fi

# Find base directory
BASE_DIR=$(pwd)
if [ -d "/app" ] && [ $IN_CONTAINER -eq 1 ]; then
  BASE_DIR="/app"
  echo "Using Docker container base directory: $BASE_DIR"
else
  # Handle case when script is run from a subdirectory
  while [ ! -f "$BASE_DIR/package.json" ] && [ "$BASE_DIR" != "/" ]; do
    BASE_DIR=$(dirname "$BASE_DIR")
  done
  
  if [ ! -f "$BASE_DIR/package.json" ]; then
    echo "❌ Error: Could not locate the project root directory (with package.json)"
    exit 1
  fi
  
  echo "Using project base directory: $BASE_DIR"
fi

cd "$BASE_DIR"

FORCE_CLEAN=0
if [ "$1" == "--force-clean" ]; then
  FORCE_CLEAN=1
  echo "⚠️  Force clean mode activated - will completely rebuild Docker images"
fi

echo ""
echo "Step 1: Checking and creating required directories..."

# Create necessary directories
mkdir -p drizzle
mkdir -p migrations

echo "✅ Created drizzle and migrations directories"

# Create placeholder files
echo "-- Placeholder migration file for Drizzle" > drizzle/placeholder.sql
echo "-- Placeholder migration file for Drizzle" > migrations/placeholder.sql

echo "✅ Created placeholder files"

# Check drizzle.config.ts and create its output directory
if [ -f "drizzle.config.ts" ]; then
  # Simple grep to find the output directory configuration
  OUT_DIR=$(grep -oP "out\s*:\s*['\"](.+?)['\"]" drizzle.config.ts | grep -oP "['\"](.*?)['\"]" | tr -d "'\"")
  
  if [ -n "$OUT_DIR" ]; then
    echo "Detected output directory from config: $OUT_DIR"
    mkdir -p "$OUT_DIR"
    echo "-- Placeholder migration file for Drizzle" > "$OUT_DIR/placeholder.sql"
    echo "✅ Created configured output directory: $OUT_DIR"
  fi
fi

echo ""
echo "Step 2: Making scripts executable..."

# Set execute permissions on scripts
chmod +x scripts/*.sh 2>/dev/null || true
chmod +x scripts/*.js 2>/dev/null || true

echo "✅ Made scripts executable"

echo ""
echo "Step 3: Preparing Docker environment..."

# Make sure .env exists
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
  echo "✅ Created .env file from example"
fi

# Check Docker and Docker Compose
if ! command -v docker &> /dev/null; then
  echo "❌ Docker is not installed. Please install Docker first."
  exit 1
fi

DOCKER_COMPOSE_CMD="docker compose"
if ! $DOCKER_COMPOSE_CMD version &> /dev/null; then
  # Try the old style command
  DOCKER_COMPOSE_CMD="docker-compose"
  if ! $DOCKER_COMPOSE_CMD version &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
  fi
fi

echo "✅ Docker environment ready"

echo ""
echo "Step 4: Rebuilding Docker images..."

# Stop running containers
$DOCKER_COMPOSE_CMD down || true

# Ensure that the directories exist in the builder context too
# This ensures they'll be available to the COPY step between the two Docker stages
echo "Ensuring directories are created for multi-stage build..."
docker run --rm -v "$(pwd):/workspace" alpine sh -c "cd /workspace && mkdir -p drizzle migrations && touch drizzle/placeholder.sql migrations/placeholder.sql"

# Clean Docker build cache if requested
if [ $FORCE_CLEAN -eq 1 ]; then
  echo "Cleaning Docker build cache..."
  docker builder prune -f
  $DOCKER_COMPOSE_CMD build --no-cache
else
  $DOCKER_COMPOSE_CMD build
fi

echo "✅ Docker images rebuilt"

echo ""
echo "Step 5: Starting application..."

# Start containers
$DOCKER_COMPOSE_CMD up -d

echo "✅ Application started"

echo ""
echo "=================================================="
echo "🎉 Fix completed! 🎉"
echo ""
echo "The application should now be running at:"
echo "http://localhost:3000"
echo ""
echo "If you're still experiencing issues, try running:"
echo "  ./scripts/fix-docker-build.sh --force-clean"
echo ""
echo "For more detailed troubleshooting, see:"
echo "  DOCKER_TROUBLESHOOTING.md"
echo "=================================================="