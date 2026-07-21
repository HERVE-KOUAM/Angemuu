from dataclasses import dataclass

@dataclass
class User:
    id: str
    email: str
    name: str
    phone: str

    def to_dict(self):
        return {'id': self.id, 'email': self.email, 'name': self.name, 'phone': self.phone}
