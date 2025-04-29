#!/bin/bash

# OBview.io Database Restore Script

# Default values
DB_USER="obviewuser"
DB_NAME="obview"
BACKUP_DIR="/opt/obview/backups"

# Check if a backup file was specified
if [ -z "$1" ]; then
  echo "Usage: $0 <backup_file>"
  echo "Example: $0 obview_backup_20250429_120000.sql.gz"
  
  echo ""
  echo "Available backups:"
  ls -lt $BACKUP_DIR/*.gz 2>/dev/null | head -10
  exit 1
fi

BACKUP_FILE="$BACKUP_DIR/$1"

# Check if the backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

# Confirm before proceeding
echo "WARNING: This will OVERWRITE the current database ($DB_NAME)!"
read -p "Are you sure you want to proceed? (y/n): " CONFIRM

if [ "$CONFIRM" != "y" ]; then
  echo "Restore cancelled"
  exit 0
fi

# Stop the application service
echo "Stopping OBview.io service..."
systemctl stop obview

# Determine if the backup is compressed
if [[ "$BACKUP_FILE" == *.gz ]]; then
  # Create a temporary file for the uncompressed backup
  TEMP_FILE="/tmp/obview_restore_$(date +%s).sql"
  echo "Decompressing backup file..."
  gunzip -c "$BACKUP_FILE" > "$TEMP_FILE"
  RESTORE_FILE="$TEMP_FILE"
else
  RESTORE_FILE="$BACKUP_FILE"
fi

# Restore the database
echo "Restoring database from: $BACKUP_FILE"
export PGPASSWORD="tbn123456789"
psql -U "$DB_USER" -h localhost -d "$DB_NAME" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
psql -U "$DB_USER" -h localhost -d "$DB_NAME" < "$RESTORE_FILE"
RESTORE_RESULT=$?
unset PGPASSWORD

# Clean up temporary file if it was created
if [ -f "$TEMP_FILE" ]; then
  rm "$TEMP_FILE"
fi

# Check if restore was successful
if [ $RESTORE_RESULT -eq 0 ]; then
  echo "Database restore completed successfully"
else
  echo "Database restore failed"
  echo "Starting OBview.io service..."
  systemctl start obview
  exit 1
fi

# Check if this is also a file backup restore
UPLOADS_BACKUP="${BACKUP_FILE/obview_backup/uploads_backup}"
UPLOADS_BACKUP="${UPLOADS_BACKUP/.sql.gz/.tar.gz}"

if [ -f "$UPLOADS_BACKUP" ]; then
  echo "Uploads backup found: $UPLOADS_BACKUP"
  read -p "Do you want to restore uploaded files as well? (y/n): " RESTORE_FILES
  
  if [ "$RESTORE_FILES" == "y" ]; then
    echo "Restoring uploaded files..."
    UPLOADS_DIR="/opt/obview/uploads"
    
    # Backup current uploads directory
    if [ -d "$UPLOADS_DIR" ]; then
      mv "$UPLOADS_DIR" "${UPLOADS_DIR}_old_$(date +%s)"
    fi
    
    # Extract the uploads backup
    tar -xzf "$UPLOADS_BACKUP" -C "/opt/obview"
    
    if [ $? -eq 0 ]; then
      echo "Uploads restore completed successfully"
    else
      echo "Uploads restore failed"
    fi
  else
    echo "Skipping uploads restore"
  fi
else
  echo "No matching uploads backup found for this database backup"
fi

# Start the application service
echo "Starting OBview.io service..."
systemctl start obview

echo "Restore process complete"