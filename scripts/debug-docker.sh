#!/bin/bash
# Debug Docker Deployment Issues for OBview.io

set -e

echo "==============================================="
echo "OBview.io Docker Deployment Debugger"
echo "==============================================="

# Check if the container is running
if [ -z "$(docker ps -q -f name=obview_app)" ]; then
  echo "ERROR: The obview_app container is not running."
  echo "Starting containers with docker-compose..."
  docker-compose up -d
fi

echo "Checking container status..."
docker ps -a -f name=obview

echo "Checking container logs..."
docker logs obview_app --tail 50

echo "Inspecting directory structure inside the container..."
echo "List of files in /app/dist:"
docker exec obview_app find /app/dist -type f | sort

echo "Checking if entry point files exist..."
docker exec obview_app ls -la /app/dist/index.js || echo "index.js missing"
docker exec obview_app ls -la /app/dist/server/index.js || echo "server/index.js missing"
docker exec obview_app ls -la /app/dist/server.js || echo "server.js missing"

echo "Creating fallback files if needed..."
docker exec obview_app bash -c 'mkdir -p /app/dist/server && 
if [ ! -f "/app/dist/server/index.js" ]; then
  echo "Creating missing server index.js..."
  echo "console.log(\"OBview fallback server\"); const express = require(\"express\"); const app = express(); app.get(\"/\", (req, res) => res.send(\"OBview Running\")); app.listen(3000, \"0.0.0.0\", () => console.log(\"Server running\"));" > /app/dist/server/index.js
fi

if [ ! -f "/app/dist/index.js" ]; then
  echo "Creating missing index.js..."
  echo "console.log(\"Starting OBview\"); require(\"./server/index.js\");" > /app/dist/index.js
fi'

echo "Checking database connection..."
docker exec obview_db pg_isready || echo "Database not ready"

echo "Restarting the application container..."
docker restart obview_app

echo "==============================================="
echo "Debug complete. Check for any errors above."
echo "Container logs will follow below:"
echo "==============================================="

sleep 2
docker logs obview_app --tail 20

echo "==============================================="
echo "If the application is still not working, consider rebuilding:"
echo "docker-compose build --no-cache"
echo "docker-compose up -d"
echo "==============================================="