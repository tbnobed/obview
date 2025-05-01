from datetime import datetime
from app import db

class Comment(db.Model):
    __tablename__ = 'comments'
    
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    file_id = db.Column(db.Integer, db.ForeignKey('files.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey('comments.id'), nullable=True)
    timestamp = db.Column(db.Float, default=0.0)  # Video timestamp in seconds
    is_resolved = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    replies = db.relationship('Comment', backref=db.backref('parent', remote_side=[id]), lazy='dynamic')
    
    def __repr__(self):
        return f'<Comment {self.id} for file {self.file_id}>'
    
    def to_dict(self):
        """Convert comment object to dictionary for API responses"""
        data = {
            'id': self.id,
            'content': self.content,
            'file_id': self.file_id,
            'user_id': self.user_id,
            'parent_id': self.parent_id,
            'timestamp': self.timestamp,
            'is_resolved': self.is_resolved,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'user': self.author.to_dict() if self.author else None
        }
        
        return data