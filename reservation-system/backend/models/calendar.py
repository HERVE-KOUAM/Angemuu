from backend.db import db
import json

class Calendar(db.Model):
    __tablename__ = 'calendars'
    id = db.Column(db.String, primary_key=True)
    name = db.Column(db.String, nullable=False)
    # store non-working days as JSON array of ISO dates
    non_working_days = db.Column(db.Text, nullable=True, default='[]')

    def get_non_working_days(self):
        try:
            return json.loads(self.non_working_days or '[]')
        except Exception:
            return []

    def is_working_day(self, iso_date: str) -> bool:
        return iso_date not in self.get_non_working_days()

    def add_non_working_day(self, iso_date: str):
        days = self.get_non_working_days()
        if iso_date not in days:
            days.append(iso_date)
            self.non_working_days = json.dumps(days)
