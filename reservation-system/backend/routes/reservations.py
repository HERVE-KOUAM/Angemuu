from flask import Blueprint, request, jsonify
from datetime import datetime
import uuid

from backend.db import db
from backend.models.reservation import Reservation
from backend.models.user import User

reservations_bp = Blueprint('reservations', __name__)

@reservations_bp.route('/', methods=['GET'])
def list_reservations():
    res = Reservation.query.order_by(Reservation.start).all()
    return jsonify([r.to_dict() for r in res]), 200

@reservations_bp.route('/', methods=['POST'])
def create_reservation():
    data = request.get_json() or {}
    user_id = data.get('user_id')
    start = data.get('start')
    end = data.get('end')
    notes = data.get('notes')

    if not user_id or not start or not end:
        return jsonify({'error': 'missing fields (user_id, start, end required)'}), 400

    try:
        start_dt = datetime.fromisoformat(start)
        end_dt = datetime.fromisoformat(end)
    except Exception:
        return jsonify({'error': 'invalid date format, use ISO8601'}), 400

    if start_dt >= end_dt:
        return jsonify({'error': 'start must be before end'}), 400

    # ensure user exists (create placeholder if not)
    user = User.query.get(user_id)
    if not user:
        user = User(id=user_id, email='', name='', phone='')
        db.session.add(user)
        db.session.commit()

    rid = data.get('id') or str(uuid.uuid4())
    reservation = Reservation(id=rid, user_id=user_id, start=start_dt, end=end_dt, notes=notes)
    db.session.add(reservation)
    db.session.commit()

    return jsonify(reservation.to_dict()), 201
