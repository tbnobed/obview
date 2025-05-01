#!/bin/bash
# Automate database backups for OBview.io
# Usage: ./backup-db.sh [destination_directory]

set -e

# Default backup directory
BACKUP_DIR=${1:-"/app/backups"}
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="obview_backup_${TIMESTAMP}.sql"
FULL_PATH="${BACKUP_DIR}/${BACKUP_FILE}"

# Ensure backup directory exists
mkdir -p ${BACKUP_DIR}

echo "Creating database backup at ${FULL_PATH}..."

# Use environment variables from docker-compose
if [ -z "$POSTGRES_PASSWORD" ]; then
  echo "POSTGRES_PASSWORD environment variable is not set."
  echo "Using values from database URL if available..."
  
  if [ -z "$DATABASE_URL" ]; then
    echo "DATABASE_URL environment variable is not set. Exiting."
    exit 1
  fi
  
  # Extract connection info from DATABASE_URL
  DB_USER=$(echo $DATABASE_URL | sed -e 's/^.*:\/\/\(.*\):.*@.*$/\1/')
  DB_PASSWORD=$(echo $DATABASE_URL | sed -e 's/^.*:\/\/.*:\(.*\)@.*$/\1/')
  DB_HOST=$(echo $DATABASE_URL | sed -e 's/^.*@\(.*\):.*\/.*$/\1/')
  DB_PORT=$(echo $DATABASE_URL | sed -e 's/^.*@.*:\(.*\)\/.*$/\1/')
  DB_NAME=$(echo $DATABASE_URL | sed -e 's/^.*\/\(.*\)$/\1/')
else
  # Use docker-compose environment variables
  DB_USER=${POSTGRES_USER:-postgres}
  DB_PASSWORD=${POSTGRES_PASSWORD}
  DB_HOST=${DB_HOST:-db}
  DB_PORT=${DB_PORT:-5432}
  DB_NAME=${POSTGRES_DB:-obview}
fi

# Create the backup
PGPASSWORD=${DB_PASSWORD} pg_dump -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -F p > ${FULL_PATH}

# Check if backup was successful
if [ $? -eq 0 ]; then
  echo "Backup successfully created at ${FULL_PATH}"
  echo "Backup size: $(du -h ${FULL_PATH} | cut -f1)"
  
  # Clean up old backups - keep only the 5 most recent
  echo "Cleaning up old backups..."
  cd ${BACKUP_DIR}
  ls -tp | grep -v '/$' | tail -n +6 | xargs -I {} rm -- {} 2>/dev/null || true
  
  echo "Retained the 5 most recent backups:"
  ls -lh ${BACKUP_DIR} | grep .sql | sort -r
else
  echo "Backup failed!"
  exit 1
fi