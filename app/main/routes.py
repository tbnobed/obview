from flask import render_template, jsonify, current_app
from flask_login import login_required
from app.main import bp
from app import socketio

@bp.route('/', defaults={'path': ''})
@bp.route('/<path:path>')
def index(path):
    """Serve the frontend application"""
    # For SPA applications, serve the index.html
    return render_template('index.html')

@bp.route('/healthcheck')
def healthcheck():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'version': '1.0.0'
    })

# Socket.IO event handlers
@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

@socketio.on('join')
def handle_join(data):
    """Join a room for real-time updates"""
    room = data.get('room')
    if room:
        socketio.join_room(room)
        print(f'Client joined room: {room}')

@socketio.on('leave')
def handle_leave(data):
    """Leave a room"""
    room = data.get('room')
    if room:
        socketio.leave_room(room)
        print(f'Client left room: {room}')