from datetime import datetime
from app import db

class Project(db.Model):
    __tablename__ = 'projects'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text, nullable=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    files = db.relationship('File', backref='project', cascade='all, delete-orphan', lazy='dynamic')
    members = db.relationship('ProjectUser', back_populates='project', cascade='all, delete-orphan', lazy='dynamic')
    
    def __repr__(self):
        return f'<Project {self.name}>'
    
    def to_dict(self):
        """Convert project object to dictionary for API responses"""
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'created_by_id': self.created_by_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    def user_has_access(self, user_id):
        """Check if a user has access to this project"""
        # Project creator always has access
        if self.created_by_id == user_id:
            return True
        
        # Check if user is a member of the project
        member = ProjectUser.query.filter_by(
            project_id=self.id,
            user_id=user_id
        ).first()
        
        return member is not None
    
    def user_has_edit_access(self, user_id):
        """Check if a user has edit access to this project"""
        # Project creator always has edit access
        if self.created_by_id == user_id:
            return True
        
        # Check if user is a member with edit permission
        member = ProjectUser.query.filter_by(
            project_id=self.id,
            user_id=user_id,
            role='editor'
        ).first()
        
        return member is not None


class ProjectUser(db.Model):
    """Association table for project members"""
    __tablename__ = 'project_users'
    
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    role = db.Column(db.String(20), default='viewer')  # viewer, editor
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    project = db.relationship('Project', back_populates='members')
    user = db.relationship('User')
    
    __table_args__ = (
        db.UniqueConstraint('project_id', 'user_id', name='uix_project_user'),
    )
    
    def __repr__(self):
        return f'<ProjectUser project_id={self.project_id} user_id={self.user_id}>'
    
    def to_dict(self):
        """Convert project user object to dictionary for API responses"""
        return {
            'id': self.id,
            'project_id': self.project_id,
            'user_id': self.user_id,
            'role': self.role,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'user': self.user.to_dict() if self.user else None
        }