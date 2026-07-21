import pytest
from backend.app import create_app
from backend.db import db

@pytest.fixture
def app():
    app = create_app({'TESTING': True, 'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:'})
    with app.app_context():
        db.init_app(app)
        db.create_all()
        yield app

@pytest.fixture
def client(app):
    return app.test_client()
