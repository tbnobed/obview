from flask import jsonify, request, current_app, g
from flask_login import current_user, login_user, logout_user, login_required
from app import db
from app.auth import bp
from app.models.user import User

@bp.route('/register', methods=['POST'])
def register():
    """Register a new user"""
    if current_user.is_authenticated:
        return jsonify({'message': 'Already authenticated'}), 400
    
    data = request.get_json() or {}
    if 'username' not in data or 'email' not in data or 'password' not in data:
        return jsonify({'error': 'Missing required fields'}), 400
    
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'error': 'Username already exists'}), 400
    
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Email already in use'}), 400
    
    user = User(
        username=data['username'],
        email=data['email'],
        name=data.get('name', data['username'])
    )
    user.set_password(data['password'])
    
    # Make first user an admin
    if User.query.count() == 0:
        user.role = 'admin'
    
    db.session.add(user)
    db.session.commit()
    
    login_user(user)
    
    return jsonify(user.to_dict()), 201

@bp.route('/login', methods=['POST'])
def login():
    """Log in a user"""
    if current_user.is_authenticated:
        return jsonify(current_user.to_dict()), 200
    
    data = request.get_json() or {}
    if 'username' not in data or 'password' not in data:
        return jsonify({'error': 'Missing username or password'}), 400
    
    user = User.query.filter_by(username=data['username']).first()
    
    if user is None or not user.check_password(data['password']):
        return jsonify({'error': 'Invalid username or password'}), 401
    
    login_user(user, remember=data.get('remember_me', False))
    
    return jsonify(user.to_dict()), 200

@bp.route('/logout', methods=['POST'])
@login_required
def logout():
    """Log out a user"""
    logout_user()
    return jsonify({'message': 'Successfully logged out'}), 200

@bp.route('/user', methods=['GET'])
def get_current_user():
    """Get current user information"""
    if current_user.is_authenticated:
        return jsonify(current_user.to_dict()), 200
    else:
        return jsonify({'error': 'Not authenticated'}), 401