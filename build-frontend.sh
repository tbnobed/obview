#!/bin/bash

# OBview.io Frontend Build Script
echo "Building OBview.io Frontend"
echo "=========================="
echo

# Check for Node.js
if ! command -v node &> /dev/null; then
  echo "Error: Node.js is required to build the frontend"
  exit 1
fi

# Navigate to the client directory
cd client || { echo "Error: client directory not found"; exit 1; }

# Install dependencies
echo "Installing dependencies..."
npm install

# Build the React application
echo "Building React application..."
npm run build

# Check if build was successful
if [ ! -d "dist" ]; then
  echo "Error: Build failed, no dist directory created"
  exit 1
fi

# Create the server's dist/public directory
echo "Creating dist/public directory..."
mkdir -p ../dist/public

# Copy build files to dist/public
echo "Copying build files to dist/public..."
cp -r dist/* ../dist/public/

echo "Frontend build complete!"
echo "Files are ready in dist/public/"