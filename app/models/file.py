from datetime import datetime
from app import db

class File(db.Model):
    __tablename__ = 'files'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    filename = db.Column(db.String(255))
    file_path = db.Column(db.String(255))
    file_type = db.Column(db.String(50))
    file_size = db.Column(db.Integer)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'))
    uploaded_by_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    version = db.Column(db.Integer, default=1)
    is_latest_version = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Relationships
    comments = db.relationship('Comment', backref='file', lazy='dynamic', cascade='all, delete-orphan')
    approvals = db.relationship('Approval', backref='file', lazy='dynamic', cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'filename': self.filename,
            'file_path': self.file_path,
            'file_type': self.file_type,
            'file_size': self.file_size,
            'project_id': self.project_id,
            'uploaded_by_id': self.uploaded_by_id,
            'version': self.version,
            'is_latest_version': self.is_latest_version,
            'created_at': self.created_at.isoformat()
        }