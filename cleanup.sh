#!/bin/bash
set -e

echo "====================================================="
echo "OBview.io File Cleanup Tool"
echo "====================================================="
echo "This script will clean up duplicate files by replacing"
echo "the original versions with the new ones (.new suffix)"
echo "====================================================="

# Function to clean up files
cleanup_files() {
  echo "Cleaning up files..."
  
  # List of files to process
  files=(
    "DEPLOYMENT.md"
    "docker-compose.yml"
    "Dockerfile"
    "scripts/direct-fix.sh"
    "scripts/setup.cjs"
    "scripts/wait-for-db.sh"
    "init-scripts/00-create-database.sh"
    "init-scripts/01-init-db.sql"
    "init-scripts/02-init-db.sh"
    "server/db.ts"
  )
  
  # Process each file
  for file in "${files[@]}"; do
    if [ -f "${file}.new" ]; then
      echo "Replacing $file with new version..."
      rm -f "$file" 2>/dev/null || true
      mv "${file}.new" "$file"
      echo "✓ Done"
    else
      echo "× Warning: ${file}.new does not exist, skipping..."
    fi
  done
}

# Function to set permissions
set_permissions() {
  echo "Setting file permissions..."
  find scripts -name "*.sh" -exec chmod +x {} \;
  find init-scripts -name "*.sh" -exec chmod +x {} \;
  chmod +x cleanup.sh
  echo "✓ File permissions set"
}

# Main function
main() {
  cleanup_files
  set_permissions
  
  echo "====================================================="
  echo "Cleanup completed successfully!"
  echo "====================================================="
  echo "All duplicate files have been replaced with their new versions."
  echo "You can now use the regular deployment files without the .new suffix."
  echo "====================================================="
}

# Execute main function
main "$@"