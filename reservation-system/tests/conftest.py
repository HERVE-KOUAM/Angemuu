import pytest
import sys
import os

# Ensure reservation-system package is importable when running tests from repo root
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.app import create_app
from backend.db import db

@pytest.fixture
def app():
    app = create_app({'TESTING': True, 'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:'})
    with app.app_context():
        # create tables; the app factory already initialized the extension
        db.create_all()
        yield app

@pytest.fixture
def client(app):
    return app.test_client()
