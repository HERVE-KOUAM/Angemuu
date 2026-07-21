from dataclasses import dataclass
from datetime import datetime
from typing import Optional

@dataclass
class Reservation:
    id: str
    user_id: str
    start: datetime
    end: datetime
    created_at: datetime = datetime.utcnow()
    notes: Optional[str] = None

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'start': self.start.isoformat(),
            'end': self.end.isoformat(),
            'created_at': self.created_at.isoformat(),
            'notes': self.notes,
        }
