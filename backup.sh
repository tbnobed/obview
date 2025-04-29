#!/bin/bash

# OBview.io Database Backup Script

# Default values
DB_USER="obviewuser"
DB_NAME="obview"
BACKUP_DIR="/opt/obview/backups"
BACKUP_RETENTION=7

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Generate timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/obview_backup_$TIMESTAMP.sql"

# Perform the backup
echo "Creating database backup: $BACKUP_FILE"
export PGPASSWORD="tbn123456789"
pg_dump -U "$DB_USER" -h localhost "$DB_NAME" > "$BACKUP_FILE"
unset PGPASSWORD

# Check if backup was successful
if [ $? -eq 0 ]; then
  echo "Backup completed successfully"
  
  # Compress the backup
  echo "Compressing backup..."
  gzip "$BACKUP_FILE"
  BACKUP_FILE="$BACKUP_FILE.gz"
  echo "Compressed backup saved to: $BACKUP_FILE"
  
  # Clean up old backups
  echo "Cleaning up old backups (keeping last $BACKUP_RETENTION days)..."
  find "$BACKUP_DIR" -name "obview_backup_*.sql.gz" -type f -mtime +$BACKUP_RETENTION -delete
else
  echo "Backup failed"
  exit 1
fi

# Create backup of uploaded files
UPLOADS_DIR="/opt/obview/uploads"
UPLOADS_BACKUP="$BACKUP_DIR/uploads_backup_$TIMESTAMP.tar.gz"

if [ -d "$UPLOADS_DIR" ]; then
  echo "Creating backup of uploads directory: $UPLOADS_BACKUP"
  tar -czf "$UPLOADS_BACKUP" -C "/opt/obview" "uploads"
  
  if [ $? -eq 0 ]; then
    echo "Uploads backup completed successfully"
  else
    echo "Uploads backup failed"
  fi
else
  echo "Uploads directory not found, skipping file backup"
fi

echo "Backup process complete"