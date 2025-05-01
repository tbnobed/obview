from datetime import datetime
from app import db

class File(db.Model):
    __tablename__ = 'files'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    filename = db.Column(db.String(255), nullable=False)
    file_path = db.Column(db.String(500), nullable=False)
    file_type = db.Column(db.String(100), nullable=True)
    file_size = db.Column(db.Integer, nullable=True)  # Size in bytes
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    uploaded_by_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    version = db.Column(db.Integer, default=1)
    is_latest_version = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    comments = db.relationship('Comment', backref='file', cascade='all, delete-orphan', lazy='dynamic')
    approvals = db.relationship('Approval', backref='file', cascade='all, delete-orphan', lazy='dynamic')
    
    def __repr__(self):
        return f'<File {self.name} (version {self.version})>'
    
    def to_dict(self):
        """Convert file object to dictionary for API responses"""
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'filename': self.filename,
            'file_type': self.file_type,
            'file_size': self.file_size,
            'project_id': self.project_id,
            'uploaded_by_id': self.uploaded_by_id,
            'version': self.version,
            'is_latest_version': self.is_latest_version,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }