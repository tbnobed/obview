#!/bin/bash

# OBview.io Restore Script
# This script restores a backup of the database and uploaded files

# Check if backup file is provided
if [ -z "$1" ]; then
  echo "Error: No backup file specified"
  echo "Usage: $0 <backup_file>"
  echo "Example: $0 /opt/obview/backups/obview_backup_20250430_123456.tar.gz"
  exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found: $BACKUP_FILE"
  exit 1
fi

# Configuration
APP_DIR=${APP_DIR:-"/opt/obview"}
DB_USER=${DB_USER:-"obviewuser"}
DB_NAME=${DB_NAME:-"obview"}
DB_PASSWORD=${DB_PASSWORD:-"tbn123456789"}
DB_HOST=${DB_HOST:-"localhost"}

echo "Starting OBview.io restore from backup: $BACKUP_FILE"
echo "==============================================="

# Get confirmation
echo "WARNING: This will overwrite the current database and uploads"
echo -n "Are you sure you want to continue? (y/n): "
read -r CONFIRM

if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "Restore canceled"
  exit 0
fi

# Create temp directory
TEMP_DIR=$(mktemp -d)
echo "Created temporary directory: $TEMP_DIR"

# Extract backup
echo "Extracting backup archive..."
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

if [ $? -ne 0 ]; then
  echo "Error: Failed to extract backup archive"
  rm -rf "$TEMP_DIR"
  exit 1
fi

# Stop the OBview service
echo "Stopping OBview service..."
systemctl stop obview

# Restore database
echo "Restoring database..."
export PGPASSWORD="$DB_PASSWORD"

# Drop existing database if it exists
echo "Dropping existing database..."
psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"

# Create new database
echo "Creating new database..."
psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;"

# Restore from backup
echo "Restoring database from backup..."
psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" < "$TEMP_DIR/database.sql"

if [ $? -ne 0 ]; then
  echo "Error: Database restore failed!"
  echo "Please check your database credentials and the backup file"
  echo "Restarting OBview service..."
  systemctl start obview
  rm -rf "$TEMP_DIR"
  exit 1
fi

# Restore uploads
echo "Restoring uploads directory..."
if [ -d "$TEMP_DIR/uploads" ]; then
  # Backup current uploads first
  if [ -d "$APP_DIR/uploads" ]; then
    echo "Backing up existing uploads directory..."
    mv "$APP_DIR/uploads" "$APP_DIR/uploads.bak_$(date +%Y%m%d_%H%M%S)"
  fi
  
  # Copy uploads from backup
  echo "Copying uploads from backup..."
  cp -r "$TEMP_DIR/uploads" "$APP_DIR/"
  
  # Set permissions
  echo "Setting permissions..."
  chown -R obtv-admin:obtv-admin "$APP_DIR/uploads"
else
  echo "Warning: No uploads directory found in backup"
fi

# Cleanup
rm -rf "$TEMP_DIR"

# Start the OBview service
echo "Starting OBview service..."
systemctl start obview

echo
echo "Restore completed successfully!"
echo "Please check the service status with: systemctl status obview"
echo