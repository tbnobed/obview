#!/bin/bash

# OBview.io Complete Package Creator
echo "Creating OBview.io Complete Package..."
echo "==================================="
echo

# Create a temporary directory
TEMP_DIR=$(mktemp -d)
echo "Created temporary directory: $TEMP_DIR"

# Build the frontend application first
echo "Building frontend application..."

# Navigate to the client directory
cd client || { echo "Error: client directory not found"; exit 1; }

# Install client dependencies
echo "Installing client dependencies..."
npm install || { echo "Failed to install client dependencies"; exit 1; }

# Build the React application
echo "Building React application..."
npm run build || { echo "Failed to build React application"; exit 1; }

# Return to original directory
cd ..

# Create the dist/public directory structure
echo "Creating dist/public directory..."
mkdir -p dist/public

# Copy build files to dist/public
echo "Copying build files to dist/public..."
cp -r client/dist/* dist/public/ || { echo "Failed to copy build files"; exit 1; }

# Copy required files to the temp directory for package
echo "Copying files for package..."
copy_if_exists() {
  if [ -f "$1" ]; then
    cp "$1" "$TEMP_DIR/"
    echo "  - Copied $1"
  else
    echo "  - File not found: $1"
  fi
}

# Server files
copy_if_exists "server.js"
copy_if_exists "database-schema.sql"
copy_if_exists "install-fixed.sh"
copy_if_exists "backup.sh"
copy_if_exists "restore.sh" 
copy_if_exists "healthcheck.js"
copy_if_exists "check-database.js"
copy_if_exists "password-util.js"
copy_if_exists "package.json"
copy_if_exists "README.md"
copy_if_exists "CONFIGURATION.md"
copy_if_exists "DEPLOYMENT.md"

# Copy dist with frontend to temp dir
echo "Copying built frontend files..."
cp -r dist "$TEMP_DIR/" || { echo "Failed to copy dist directory"; exit 1; }

# Create uploads directory
mkdir -p "$TEMP_DIR/uploads"
echo "Created uploads directory"

# Rename the install script to install.sh
if [ -f "$TEMP_DIR/install-fixed.sh" ]; then
  mv "$TEMP_DIR/install-fixed.sh" "$TEMP_DIR/install.sh"
  echo "Renamed install-fixed.sh to install.sh"
fi

# Create package
PACKAGE_NAME="obview-$(date +%Y%m%d).tar.gz"
echo "Creating package: $PACKAGE_NAME..."
tar -czf $PACKAGE_NAME -C $TEMP_DIR . || { echo "Failed to create package"; exit 1; }
echo "Created package: $PWD/$PACKAGE_NAME"

# Clean up
rm -rf $TEMP_DIR
echo "Cleaned up temporary directory"
echo
echo "Package created successfully!"
echo "To deploy, extract the package and run the installation script:"
echo "  tar -xzf $PACKAGE_NAME"
echo "  sudo chmod +x install.sh"
echo "  sudo ./install.sh"