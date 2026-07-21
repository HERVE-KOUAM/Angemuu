from backend.db import db

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.String, primary_key=True)
    email = db.Column(db.String, nullable=True)
    name = db.Column(db.String, nullable=True)
    phone = db.Column(db.String, nullable=True)

    def to_dict(self):
        return {'id': self.id, 'email': self.email, 'name': self.name, 'phone': self.phone}
