from datetime import datetime
from app import db

class Comment(db.Model):
    __tablename__ = 'comments'
    
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    file_id = db.Column(db.Integer, db.ForeignKey('files.id'))
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    timestamp = db.Column(db.Float, default=0)  # Timestamp in video/audio (seconds)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'content': self.content,
            'file_id': self.file_id,
            'user_id': self.user_id,
            'username': self.author.username if self.author else None,
            'name': self.author.name if self.author else None,
            'timestamp': self.timestamp,
            'created_at': self.created_at.isoformat()
        }