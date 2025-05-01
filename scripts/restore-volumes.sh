#!/bin/bash
# Restore Docker volumes for OBview.io from backup
# Usage: ./restore-volumes.sh /path/to/obview_volumes_YYYYMMDD_HHMMSS.tar.gz

set -e

if [ $# -eq 0 ]; then
  echo "Error: No backup file specified"
  echo "Usage: ./restore-volumes.sh /path/to/obview_volumes_YYYYMMDD_HHMMSS.tar.gz"
  exit 1
fi

BACKUP_FILE=$1

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file not found at $BACKUP_FILE"
  exit 1
fi

echo "Starting Docker volume restoration from $BACKUP_FILE at $(date)"
echo ""
echo "WARNING: This will overwrite data in Docker volumes!"
echo "Make sure that the containers using these volumes are stopped."
echo "Press Ctrl+C now to abort or Enter to continue..."
read

# Check if Docker is available
if ! command -v docker &> /dev/null; then
  echo "Error: Docker command not found."
  exit 1
fi

# Create temporary directory for extracted backup
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Extract the backup file to temp directory
echo "Extracting backup to temporary directory..."
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

# List expected volumes based on backup directory structure
VOLUMES=($(ls -1 "$TEMP_DIR"))

# Expected Docker Compose volume names (modify if your docker-compose setup uses different names)
# Docker Compose prefixes volumes with the directory name
EXPECTED_VOLUMES=(
  "workspace_postgres_data"
  "workspace_uploads"
)

if [ ${#VOLUMES[@]} -eq 0 ]; then
  echo "Error: No volume data found in backup file"
  exit 1
fi

echo "Found ${#VOLUMES[@]} volumes in backup:"
for VOLUME in "${VOLUMES[@]}"; do
  echo "- $VOLUME"
done

# Restore each volume
for VOLUME in "${VOLUMES[@]}"; do
  echo "Checking if volume $VOLUME exists..."
  
  # Check if volume exists
  if ! docker volume inspect "$VOLUME" &> /dev/null; then
    echo "Volume $VOLUME does not exist. Creating it..."
    docker volume create "$VOLUME"
  fi
  
  echo "Restoring data to volume: $VOLUME"
  
  # Use Docker to copy data from temp directory to the volume
  if docker run --rm -v "${VOLUME}:/target" -v "${TEMP_DIR}/${VOLUME}:/source" \
    alpine sh -c "rm -rf /target/* && cd /source && tar -cf - . | (cd /target && tar -xf -)"; then
    echo "Volume $VOLUME restored successfully"
  else
    echo "Error restoring volume $VOLUME"
    exit 1
  fi
done

echo "Volume restoration completed successfully at $(date)"
echo "You may now restart your containers"