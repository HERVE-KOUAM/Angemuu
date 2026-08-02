import os
from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_migrate import Migrate

from backend.db import db
from backend.routes.reservations import reservations_bp
from backend.routes.calendar import calendar_bp

load_dotenv()

migrate = Migrate()


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=False)
    database_url = os.getenv('DATABASE_URL', 'sqlite:///reservation.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    if test_config:
        app.config.update(test_config)

    db.init_app(app)
    migrate.init_app(app, db)

    app.register_blueprint(reservations_bp, url_prefix='/api/reservations')
    app.register_blueprint(calendar_bp, url_prefix='/api/calendar')

    @app.route('/')
    def index():
        return jsonify({'message': 'Reservation System API'}), 200

    return app
