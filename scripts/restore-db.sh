#!/bin/bash
# Restore database from a backup for OBview.io
# Usage: ./restore-db.sh path/to/backup.sql

set -e

if [ $# -eq 0 ]; then
  echo "Error: No backup file specified"
  echo "Usage: ./restore-db.sh path/to/backup.sql"
  exit 1
fi

BACKUP_FILE=$1

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found at $BACKUP_FILE"
  exit 1
fi

echo "Starting database restore from $BACKUP_FILE..."
echo ""
echo "WARNING: This will overwrite your current database!"
echo "Press Ctrl+C now to abort or Enter to continue..."
read

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

echo "Restoring database $DB_NAME from backup file: $BACKUP_FILE"
echo "Host: $DB_HOST:$DB_PORT"
echo "User: $DB_USER"

# Restore the backup
cat "$BACKUP_FILE" | PGPASSWORD=${DB_PASSWORD} psql -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME}

# Check if restore was successful
if [ $? -eq 0 ]; then
  echo "Database restore completed successfully!"
else
  echo "Database restore failed!"
  exit 1
fi