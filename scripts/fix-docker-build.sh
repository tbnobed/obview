#!/bin/bash
# Script to fix Docker build issues and rebuild the application
# Usage: ./scripts/fix-docker-build.sh [--force-clean]

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running with --force-clean option
FORCE_CLEAN=false
if [[ "$1" == "--force-clean" ]]; then
  FORCE_CLEAN=true
fi

echo -e "${GREEN}OBview.io Docker Build Fix Script${NC}"
echo -e "${YELLOW}This script will attempt to fix Docker build issues${NC}"
echo ""

# Ensure we're in the project root directory
cd "$(dirname "$0")/.."
SCRIPT_DIR="$(pwd)"

echo -e "${GREEN}Step 1: Creating required directories${NC}"
mkdir -p drizzle
mkdir -p migrations
mkdir -p uploads
touch drizzle/.gitkeep
touch migrations/.gitkeep

echo -e "${GREEN}Step 2: Ensuring scripts are executable${NC}"
chmod +x scripts/*.sh
chmod +x scripts/*.js 2>/dev/null || true

echo -e "${GREEN}Step 3: Creating empty Drizzle migration files if needed${NC}"
if [ ! -f "drizzle/placeholder.sql" ]; then
  echo "-- Placeholder migration file" > drizzle/placeholder.sql
  echo "Created placeholder migration file"
fi

if [ ! -f "migrations/placeholder.sql" ]; then
  echo "-- Placeholder migration file" > migrations/placeholder.sql
  echo "Created placeholder migration file"
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}Error: Docker is not running. Please start Docker and try again.${NC}"
  exit 1
fi

# Check if docker-compose exists
if ! command -v docker compose &> /dev/null; then
  echo -e "${YELLOW}Warning: 'docker compose' not found, trying 'docker-compose'${NC}"
  DOCKER_COMPOSE="docker-compose"
else
  DOCKER_COMPOSE="docker compose"
fi

if [ "$FORCE_CLEAN" = true ]; then
  echo -e "${YELLOW}Force clean requested. Stopping containers and removing images...${NC}"
  
  # Stop all containers
  $DOCKER_COMPOSE down || true
  
  # Remove all related images
  echo "Removing Docker images related to OBview.io..."
  docker images | grep obview | awk '{print $3}' | xargs docker rmi -f 2>/dev/null || true
  
  echo "Pruning Docker system..."
  docker system prune -f
else
  echo -e "${YELLOW}Stopping any running containers...${NC}"
  $DOCKER_COMPOSE down || true
fi

echo -e "${GREEN}Step 4: Rebuilding Docker images${NC}"
$DOCKER_COMPOSE build --no-cache

echo -e "${GREEN}Step 5: Starting containers${NC}"
$DOCKER_COMPOSE up -d

echo -e "${GREEN}Build and startup complete!${NC}"
echo -e "Check logs with: ${YELLOW}docker compose logs -f${NC}"
echo ""
echo -e "${YELLOW}If you still encounter issues, run this script with --force-clean:${NC}"
echo -e "${YELLOW}./scripts/fix-docker-build.sh --force-clean${NC}"
echo ""
echo -e "${GREEN}Container status:${NC}"
$DOCKER_COMPOSE ps