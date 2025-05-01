from datetime import datetime
from app import db

class Approval(db.Model):
    __tablename__ = 'approvals'
    
    id = db.Column(db.Integer, primary_key=True)
    file_id = db.Column(db.Integer, db.ForeignKey('files.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    status = db.Column(db.String(20), default='pending')  # pending, approved, rejected, requested_changes
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f'<Approval {self.id} for file {self.file_id} - {self.status}>'
    
    def to_dict(self):
        """Convert approval object to dictionary for API responses"""
        return {
            'id': self.id,
            'file_id': self.file_id,
            'user_id': self.user_id,
            'status': self.status,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'user': self.reviewer.to_dict() if self.reviewer else None
        }