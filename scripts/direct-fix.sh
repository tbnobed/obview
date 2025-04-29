#!/bin/bash
# direct-fix.sh
#
# This is a simplified, direct Docker build fixer for OBview.io
# Use this when the regular fix-docker-build.sh script doesn't work

set -e

echo "🛠️ OBview.io Direct Docker Build Fixer 🛠️"
echo "=========================================="

# Find project directory
if [ -f "package.json" ]; then
  PROJECT_DIR="$(pwd)"
else
  # Try to find it by going up
  PROJECT_DIR="$(pwd)"
  while [ ! -f "$PROJECT_DIR/package.json" ] && [ "$PROJECT_DIR" != "/" ]; do
    PROJECT_DIR=$(dirname "$PROJECT_DIR")
  done
  
  if [ ! -f "$PROJECT_DIR/package.json" ]; then
    echo "❌ Error: Not in a Node.js project directory"
    exit 1
  fi
fi

cd "$PROJECT_DIR"
echo "📂 Using project directory: $PROJECT_DIR"

# Create essential directories with placeholder content
echo "📂 Creating essential directories..."
mkdir -p drizzle migrations

# Create placeholder files
echo "📄 Creating placeholder files..."
echo "-- Placeholder migration file" > drizzle/placeholder.sql
echo "-- Placeholder migration file" > migrations/placeholder.sql

# Check if we have Docker and Docker Compose
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Error: Docker is not installed"
  exit 1
fi

# Determine Docker Compose command
if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE="docker compose"
else
  if docker-compose version >/dev/null 2>&1; then
    DOCKER_COMPOSE="docker-compose"
  else
    echo "❌ Error: Docker Compose is not installed"
    exit 1
  fi
fi

echo "🔄 Stopping current containers..."
$DOCKER_COMPOSE down

# First approach: Update the Dockerfile
echo "🔧 Attempting to fix the Dockerfile..."

# Check if Dockerfile exists
if [ ! -f "Dockerfile" ]; then
  echo "❌ Error: Dockerfile not found"
  exit 1
fi

# Make a backup of the Dockerfile
cp Dockerfile Dockerfile.bak

# Update the Dockerfile - simplified approach that should work regardless of the original content
cat > Dockerfile <<EOL
# Stage 1: Builder
FROM node:20-alpine as builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ libc6-compat

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Install pg and remove @neondatabase/serverless (local PostgreSQL support)
RUN npm uninstall @neondatabase/serverless || true
RUN npm install pg

# Copy source code
COPY . .

# Create essential directories
RUN mkdir -p drizzle migrations
RUN echo "-- Placeholder migration file" > drizzle/placeholder.sql
RUN echo "-- Placeholder migration file" > migrations/placeholder.sql

# Build the application
RUN npm run build

# Stage 2: Production
FROM node:20-alpine as production

# Install PostgreSQL client for health checks
RUN apk add --no-cache postgresql-client

WORKDIR /app

# Copy built assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/drizzle.config.ts ./

# Create necessary directories
RUN mkdir -p uploads
RUN mkdir -p migrations
RUN mkdir -p drizzle

# Create placeholder files
RUN echo "-- Placeholder migration file" > migrations/placeholder.sql
RUN echo "-- Placeholder drizzle file" > drizzle/placeholder.sql

# Copy scripts and config files
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/.env* ./

# Rename setup.js to setup.cjs
RUN if [ -f "/app/scripts/setup.js" ]; then \
    cp /app/scripts/setup.js /app/scripts/setup.cjs; \
    sed -i 's/@neondatabase\/serverless/pg/g' /app/scripts/setup.cjs; \
fi

# Make scripts executable
RUN chmod +x ./scripts/*.sh || true

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Create a volume for uploads
VOLUME /app/uploads

# Install additional package for PostgreSQL support
RUN npm install pg

# Set entrypoint to our initialization script
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]

# Start the application
CMD ["node", "dist/server/index.js"]
EOL

echo "✅ Fixed Dockerfile"

# Make sure scripts are executable
chmod +x scripts/*.sh 2>/dev/null || true

# Rebuild and start
echo "🔨 Rebuilding Docker images (this may take a while)..."
$DOCKER_COMPOSE build

echo "🚀 Starting the application..."
$DOCKER_COMPOSE up -d

echo ""
echo "=========================================="
echo "✅ Fix completed!"
echo "The application should now be running."
echo ""
echo "If you're still having issues, try:"
echo "1. $DOCKER_COMPOSE logs -f"
echo "2. Running '$DOCKER_COMPOSE build --no-cache' for a clean build"
echo "=========================================="