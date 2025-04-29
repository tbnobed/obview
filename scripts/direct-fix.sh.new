#!/bin/bash
set -e

echo "====================================================="
echo "OBview.io Docker Deployment Quick Fix Tool"
echo "====================================================="
echo "This script will fix common Docker deployment issues by:"
echo "1. Creating all necessary deployment files from scratch"
echo "2. Setting proper permissions on scripts"
echo "3. Rebuilding the Docker containers"
echo "====================================================="

# Function to check if Docker is installed
check_docker() {
  if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker is not installed. Please install Docker first."
    exit 1
  fi
  
  if ! command -v docker compose &> /dev/null; then
    echo "ERROR: Docker Compose is not installed. Please install Docker Compose first."
    exit 1
  fi
}

# Function to create directories
create_directories() {
  echo "Creating necessary directories..."
  mkdir -p scripts init-scripts drizzle migrations
  touch drizzle/placeholder.sql
  touch migrations/placeholder.sql
  mkdir -p uploads
  chmod 777 uploads
}

# Function to set permissions
set_permissions() {
  echo "Setting file permissions..."
  find scripts -name "*.sh" -exec chmod +x {} \;
  find init-scripts -name "*.sh" -exec chmod +x {} \;
}

# Main function
main() {
  check_docker
  
  echo "Stopping any running containers..."
  docker compose down || true
  
  create_directories
  
  echo "Replacing Docker configuration files with fixed versions..."
  
  # Rename .new files to replace the originals
  for file in Dockerfile.new docker-compose.yml.new scripts/docker-entrypoint.sh.new scripts/wait-for-db.sh.new init-scripts/01-init-db.sql.new init-scripts/02-init-db.sh.new scripts/direct-fix.sh.new; do
    if [ -f "$file" ]; then
      base_file="${file%.new}"
      echo "Replacing $base_file with fixed version..."
      mv "$file" "$base_file"
    fi
  done
  
  set_permissions
  
  # Clean up Docker artifacts
  echo "Cleaning Docker cache..."
  docker container prune -f
  docker builder prune -f
  
  echo "Rebuilding Docker containers..."
  docker compose build --no-cache
  
  echo "Starting Docker containers..."
  docker compose up -d
  
  echo "====================================================="
  echo "Fix completed successfully!"
  echo "====================================================="
  echo "The application should now be running at http://localhost:3000"
  echo ""
  echo "To check logs:"
  echo "  docker compose logs -f"
  echo ""
  echo "To check status:"
  echo "  docker compose ps"
  echo "====================================================="
}

# Execute main function
main "$@"