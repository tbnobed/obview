#!/bin/bash

# OBview.io Backup Script
# This script creates a backup of the database and uploaded files

# Configuration
APP_DIR=${APP_DIR:-"/opt/obview"}
BACKUP_DIR=${BACKUP_DIR:-"$APP_DIR/backups"}
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="obview_backup_$DATE.tar.gz"
DB_USER=${DB_USER:-"obviewuser"}
DB_NAME=${DB_NAME:-"obview"}
DB_PASSWORD=${DB_PASSWORD:-"tbn123456789"}
DB_HOST=${DB_HOST:-"localhost"}

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "Starting OBview.io backup..."
echo "============================"

# Create temp directory
TEMP_DIR=$(mktemp -d)
echo "Created temporary directory: $TEMP_DIR"

# Backup database
echo "Backing up database..."
export PGPASSWORD="$DB_PASSWORD"
pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" > "$TEMP_DIR/database.sql"

if [ $? -ne 0 ]; then
  echo "Error: Database backup failed!"
  echo "Please check your database credentials"
  rm -rf "$TEMP_DIR"
  exit 1
fi

# Backup uploads
echo "Backing up uploads directory..."
if [ -d "$APP_DIR/uploads" ]; then
  cp -r "$APP_DIR/uploads" "$TEMP_DIR/"
else
  echo "Warning: Uploads directory not found at $APP_DIR/uploads"
  mkdir -p "$TEMP_DIR/uploads"
fi

# Create archive
echo "Creating backup archive..."
cd "$TEMP_DIR"
tar -czf "$BACKUP_DIR/$BACKUP_FILE" .
cd - > /dev/null

# Cleanup
rm -rf "$TEMP_DIR"

echo
echo "Backup completed successfully!"
echo "Backup file: $BACKUP_DIR/$BACKUP_FILE"
echo "Backup size: $(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)"
echo

# Keep only the 5 most recent backups
echo "Cleaning up old backups..."
cd "$BACKUP_DIR"
ls -t obview_backup_*.tar.gz | tail -n +6 | xargs rm -f 2>/dev/null
echo "Retained the 5 most recent backups"
echo

echo "To restore from this backup, run:"
echo "  sudo ./restore.sh $BACKUP_DIR/$BACKUP_FILE"
echo