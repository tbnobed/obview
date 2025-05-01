#!/bin/bash

# Start Node.js application in the background
echo "Starting Node.js application on port 5000..."
npm run dev &
NODE_PID=$!

# Start Flask application in the background
echo "Starting Flask application on port 5001..."
python start_flask.py &
FLASK_PID=$!

# Handle script termination
function cleanup {
  echo "Shutting down services..."
  kill $NODE_PID
  kill $FLASK_PID
  exit
}

# Register trap for cleanup
trap cleanup SIGINT SIGTERM

# Keep script running
echo "Both applications started. Press Ctrl+C to stop all services."
wait