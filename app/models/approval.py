from datetime import datetime
from app import db

class Approval(db.Model):
    __tablename__ = 'approvals'
    
    id = db.Column(db.Integer, primary_key=True)
    file_id = db.Column(db.Integer, db.ForeignKey('files.id'))
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    status = db.Column(db.String(20))  # approved, rejected, pending
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'file_id': self.file_id,
            'user_id': self.user_id,
            'username': self.user.username if self.user else None,
            'name': self.user.name if self.user else None,
            'status': self.status,
            'notes': self.notes,
            'created_at': self.created_at.isoformat()
        }