from flask import Flask, jsonify
from dotenv import load_dotenv
import os

load_dotenv()

from backend.routes.reservations import reservations_bp
from backend.routes.calendar import calendar_bp
from backend.db import db


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=False)
    database_url = os.getenv('DATABASE_URL', 'sqlite:///reservation.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    if test_config:
        app.config.update(test_config)

    db.init_app(app)

    # Register blueprints
    app.register_blueprint(reservations_bp, url_prefix='/api/reservations')
    app.register_blueprint(calendar_bp, url_prefix='/api/calendar')

    @app.route('/')
    def index():
        return jsonify({'message': 'Reservation System API'}), 200

    return app


if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        db.create_all()
    app.run(host='0.0.0.0', port=5000, debug=True)
