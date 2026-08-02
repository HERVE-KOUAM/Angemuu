from backend.db import db
from datetime import datetime

class Reservation(db.Model):
    __tablename__ = 'reservations'
    id = db.Column(db.String, primary_key=True)
    user_id = db.Column(db.String, db.ForeignKey('users.id'), nullable=False)
    start = db.Column(db.DateTime, nullable=False)
    end = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    notes = db.Column(db.Text, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'start': self.start.isoformat() if self.start else None,
            'end': self.end.isoformat() if self.end else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'notes': self.notes,
        }
