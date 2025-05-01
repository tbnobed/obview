from datetime import datetime
from app import db

class ProjectUser(db.Model):
    __tablename__ = 'project_users'
    
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), primary_key=True)
    role = db.Column(db.String(20), default='viewer')  # editor, viewer
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    project = db.relationship('Project', back_populates='members')
    user = db.relationship('User', back_populates='project_memberships')
    
    def to_dict(self):
        return {
            'project_id': self.project_id,
            'user_id': self.user_id,
            'role': self.role,
            'created_at': self.created_at.isoformat()
        }

class Project(db.Model):
    __tablename__ = 'projects'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(128), nullable=False)
    description = db.Column(db.Text)
    created_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    files = db.relationship('File', backref='project', lazy='dynamic', cascade='all, delete-orphan')
    members = db.relationship('ProjectUser', back_populates='project', lazy='dynamic', cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'created_by_id': self.created_by_id,
            'created_at': self.created_at.isoformat()
        }
    
    def user_has_access(self, user_id):
        """Check if user has access to this project"""
        if self.created_by_id == user_id:
            return True
        return self.members.filter_by(user_id=user_id).first() is not None