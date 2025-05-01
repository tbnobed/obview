import os
from functools import wraps
import uuid
from flask import jsonify, request, current_app, g, send_file
from flask_login import current_user, login_required
from flask_socketio import emit
from werkzeug.utils import secure_filename
from app import db, socketio
from app.api import bp
from app.models.user import User
from app.models.project import Project, ProjectUser
from app.models.file import File
from app.models.comment import Comment
from app.models.approval import Approval

def check_project_access(view_func):
    """Decorator to check if user has access to a project"""
    @wraps(view_func)
    def wrapped_view(*args, **kwargs):
        project_id = kwargs.get('project_id')
        if not project_id:
            return jsonify({'error': 'Project ID required'}), 400
            
        project = Project.query.get_or_404(project_id)
        if not project.user_has_access(current_user.id):
            return jsonify({'error': 'You do not have access to this project'}), 403
            
        g.project = project
        return view_func(*args, **kwargs)
    return wrapped_view

def check_file_access(view_func):
    """Decorator to check if user has access to a file"""
    @wraps(view_func)
    def wrapped_view(*args, **kwargs):
        file_id = kwargs.get('file_id')
        if not file_id:
            return jsonify({'error': 'File ID required'}), 400
            
        file = File.query.get_or_404(file_id)
        project = Project.query.get(file.project_id)
        
        if not project.user_has_access(current_user.id):
            return jsonify({'error': 'You do not have access to this file'}), 403
            
        g.file = file
        return view_func(*args, **kwargs)
    return wrapped_view

def allowed_file(filename):
    """Check if file type is allowed"""
    ALLOWED_EXTENSIONS = {'mp4', 'mov', 'avi', 'wmv', 'flv', 'webm', 'mkv', 
                          'jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 
                          'xls', 'xlsx', 'ppt', 'pptx'}
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# User routes
@bp.route('/users', methods=['GET'])
@login_required
def get_users():
    """Get all users (admin only)"""
    if current_user.role != 'admin':
        return jsonify({'error': 'Admin access required'}), 403
        
    users = User.query.all()
    return jsonify([user.to_dict() for user in users]), 200

# Project routes
@bp.route('/projects', methods=['GET'])
@login_required
def get_projects():
    """Get all projects the user has access to"""
    # Get projects created by user or where user is a member
    own_projects = Project.query.filter_by(created_by_id=current_user.id)
    
    # Get projects where user is a member
    member_project_ids = db.session.query(ProjectUser.project_id).filter_by(user_id=current_user.id)
    member_projects = Project.query.filter(Project.id.in_(member_project_ids))
    
    # Combine and sort projects
    projects = own_projects.union(member_projects).order_by(Project.created_at.desc()).all()
    
    return jsonify([project.to_dict() for project in projects]), 200

@bp.route('/projects', methods=['POST'])
@login_required
def create_project():
    """Create a new project"""
    data = request.get_json() or {}
    if 'name' not in data:
        return jsonify({'error': 'Name is required'}), 400
        
    project = Project(
        name=data['name'],
        description=data.get('description', ''),
        created_by_id=current_user.id
    )
    
    db.session.add(project)
    db.session.commit()
    
    return jsonify(project.to_dict()), 201

@bp.route('/projects/<int:project_id>', methods=['GET'])
@login_required
@check_project_access
def get_project(project_id):
    """Get a specific project"""
    return jsonify(g.project.to_dict()), 200

# File routes
@bp.route('/projects/<int:project_id>/files', methods=['GET'])
@login_required
@check_project_access
def get_files(project_id):
    """Get all files for a project"""
    files = File.query.filter_by(project_id=project_id).order_by(File.created_at.desc()).all()
    return jsonify([file.to_dict() for file in files]), 200

@bp.route('/projects/<int:project_id>/files', methods=['POST'])
@login_required
@check_project_access
def upload_file(project_id):
    """Upload a new file to a project"""
    # Check if file was included
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
        
    if not allowed_file(file.filename):
        return jsonify({'error': 'File type not allowed'}), 400
    
    # Save the file
    filename = secure_filename(file.filename)
    unique_filename = f"{uuid.uuid4()}_{filename}"
    file_path = os.path.join(current_app.config['UPLOAD_FOLDER'], unique_filename)
    file.save(file_path)
    
    # Create file record
    new_file = File(
        name=request.form.get('name', filename),
        description=request.form.get('description', ''),
        filename=filename,
        file_path=file_path,
        file_type=file.content_type,
        file_size=os.path.getsize(file_path),
        project_id=project_id,
        uploaded_by_id=current_user.id,
        version=1,
        is_latest_version=True
    )
    
    db.session.add(new_file)
    db.session.commit()
    
    # Notify other users
    socketio.emit('file_upload', {
        'project_id': project_id,
        'file': new_file.to_dict(),
        'user': current_user.to_dict()
    }, room=f'project_{project_id}')
    
    return jsonify(new_file.to_dict()), 201

@bp.route('/files/<int:file_id>/content', methods=['GET'])
@login_required
@check_file_access
def get_file_content(file_id):
    """Get file content"""
    if not os.path.exists(g.file.file_path):
        return jsonify({'error': 'File not found'}), 404
        
    return send_file(g.file.file_path, as_attachment=False, 
                     download_name=g.file.filename)

# Comment routes
@bp.route('/files/<int:file_id>/comments', methods=['GET'])
@login_required
@check_file_access
def get_comments(file_id):
    """Get all comments for a file"""
    comments = Comment.query.filter_by(file_id=file_id).order_by(Comment.timestamp).all()
    return jsonify([comment.to_dict() for comment in comments]), 200

@bp.route('/files/<int:file_id>/comments', methods=['POST'])
@login_required
@check_file_access
def create_comment(file_id):
    """Create a new comment for a file"""
    data = request.get_json() or {}
    if 'content' not in data:
        return jsonify({'error': 'Content is required'}), 400
        
    comment = Comment(
        content=data['content'],
        file_id=file_id,
        user_id=current_user.id,
        timestamp=data.get('timestamp', 0)
    )
    
    db.session.add(comment)
    db.session.commit()
    
    # Include user data with the comment
    comment_data = comment.to_dict()
    
    # Emit websocket event
    socketio.emit('new_comment', comment_data, room=f'file_{file_id}')
    
    return jsonify(comment_data), 201

# Approval routes
@bp.route('/files/<int:file_id>/approvals', methods=['GET'])
@login_required
@check_file_access
def get_approvals(file_id):
    """Get all approvals for a file"""
    approvals = Approval.query.filter_by(file_id=file_id).all()
    return jsonify([approval.to_dict() for approval in approvals]), 200

@bp.route('/files/<int:file_id>/approvals', methods=['POST'])
@login_required
@check_file_access
def create_approval(file_id):
    """Create or update an approval for a file"""
    data = request.get_json() or {}
    if 'status' not in data:
        return jsonify({'error': 'Status is required'}), 400
        
    if data['status'] not in ['approved', 'rejected', 'pending']:
        return jsonify({'error': 'Invalid status'}), 400
    
    # Check if user already has an approval for this file
    existing_approval = Approval.query.filter_by(
        file_id=file_id, 
        user_id=current_user.id
    ).first()
    
    if existing_approval:
        # Update existing approval
        existing_approval.status = data['status']
        existing_approval.notes = data.get('notes', '')
        db.session.commit()
        approval = existing_approval
    else:
        # Create new approval
        approval = Approval(
            file_id=file_id,
            user_id=current_user.id,
            status=data['status'],
            notes=data.get('notes', '')
        )
        db.session.add(approval)
        db.session.commit()
    
    # Include user data with the approval
    approval_data = approval.to_dict()
    
    # Emit websocket event
    socketio.emit('approval_update', approval_data, room=f'file_{file_id}')
    
    return jsonify(approval_data), 201

# Health check
@bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'ok'}), 200