#!/usr/bin/env python
"""
Startup script for OBview.io Flask application
"""

import os
import sys
from run import app, socketio, db

if __name__ == '__main__':
    print("Starting OBview.io Flask Application...")
    
    # Create database if it doesn't exist
    with app.app_context():
        try:
            print("Initializing database...")
            db.create_all()
            print("Database initialized successfully!")
        except Exception as e:
            print(f"Error initializing database: {e}")
            sys.exit(1)
    
    # Get port from environment or use default
    port = int(os.environ.get('FLASK_PORT', 5001))
    host = os.environ.get('FLASK_HOST', '0.0.0.0')
    
    print(f"Starting server on {host}:{port}...")
    socketio.run(
        app,
        host=host,
        port=port,
        debug=True,
        use_reloader=True,
        log_output=True,
        allow_unsafe_werkzeug=True
    )