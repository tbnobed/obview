#!/bin/bash

# OBview.io Package Creator
echo "Creating OBview.io Package..."
echo "==========================="

# Create a temporary directory
TEMP_DIR=$(mktemp -d)
echo "Created temporary directory: $TEMP_DIR"

# Build the frontend application
echo "Building frontend application..."
cd client
npm install
npm run build
if [ $? -ne 0 ]; then
  echo "Frontend build failed. Aborting package creation."
  rm -rf $TEMP_DIR
  exit 1
fi
cd ..

# Copy required files to the temp directory
echo "Copying files..."
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
copy_if_exists "install.sh"
copy_if_exists "backup.sh"
copy_if_exists "restore.sh" 
copy_if_exists "healthcheck.js"
copy_if_exists "check-database.js"
copy_if_exists "password-util.js"
copy_if_exists "package.json.template"
copy_if_exists "README.md"
copy_if_exists "CONFIGURATION.md"
copy_if_exists "DEPLOYMENT.md"

# Copy built frontend files
if [ -d "client/dist" ]; then
  mkdir -p "$TEMP_DIR/dist"
  cp -r client/dist/* "$TEMP_DIR/dist/"
  echo "  - Copied built frontend assets"
else
  echo "  - Frontend build output not found"
  exit 1
fi

# Create uploads directory
mkdir -p "$TEMP_DIR/uploads"
echo "Created uploads directory"

# Create package
PACKAGE_NAME="obview-$(date +%Y%m%d).tar.gz"
tar -czf $PACKAGE_NAME -C $TEMP_DIR .
echo "Created package: $PWD/$PACKAGE_NAME"

# Clean up
rm -rf $TEMP_DIR
echo "Cleaned up temporary directory"
echo
echo "Package created successfully!"
echo "To deploy, extract the package and run the installation script:"
echo "  tar -xzf $PACKAGE_NAME"
echo "  cd obview-*"
echo "  sudo chmod +x install.sh"
echo "  sudo ./install.sh"