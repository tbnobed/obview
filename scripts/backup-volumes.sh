#!/bin/bash
# Backup Docker volumes for OBview.io
# Usage: ./backup-volumes.sh [destination_directory]

set -e

# Default backup directory (change if needed)
BACKUP_DIR=${1:-"/var/backups/obview/volumes"}
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
VOLUME_BACKUP_FILE="obview_volumes_${TIMESTAMP}.tar.gz"
FULL_PATH="${BACKUP_DIR}/${VOLUME_BACKUP_FILE}"

# Ensure backup directory exists
mkdir -p ${BACKUP_DIR}

echo "Starting Docker volume backup at $(date)"

# List of volumes to back up
# Note: Docker Compose prefixes volumes with the directory name by default
# These should match your docker-compose.yml volume names
VOLUMES=(
  "workspace_postgres_data"
  "workspace_uploads"
)

# Create temporary directory for volume data
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Back up each volume
for VOLUME in "${VOLUMES[@]}"; do
  echo "Backing up volume: $VOLUME"
  
  # Create a directory for this volume
  mkdir -p "${TEMP_DIR}/${VOLUME}"
  
  # Use Docker to copy data from the volume to our temp directory
  if docker run --rm -v "${VOLUME}:/source" -v "${TEMP_DIR}/${VOLUME}:/backup" \
    alpine sh -c "cd /source && tar -cf - . | (cd /backup && tar -xf -)"; then
    echo "Volume $VOLUME data copied successfully to temp directory"
  else
    echo "Error backing up volume $VOLUME"
    exit 1
  fi
done

# Create the archive of all volumes
echo "Creating archive of all volumes at ${FULL_PATH}"
tar -czf "${FULL_PATH}" -C "${TEMP_DIR}" .

# Verify archive was created
if [ -f "${FULL_PATH}" ]; then
  echo "Backup completed successfully: ${FULL_PATH}"
  echo "Backup size: $(du -h ${FULL_PATH} | cut -f1)"
  
  # Clean up old backups - keep only the 3 most recent volume backups
  echo "Cleaning up old volume backups..."
  cd ${BACKUP_DIR}
  ls -tp | grep -v '/$' | grep 'obview_volumes_' | tail -n +4 | xargs -I {} rm -- {} 2>/dev/null || true
  
  echo "Retained the 3 most recent volume backups:"
  ls -lh ${BACKUP_DIR} | grep obview_volumes_ | sort -r
else
  echo "Backup failed: ${FULL_PATH} not found"
  exit 1
fi

echo "Volume backup process completed at $(date)"