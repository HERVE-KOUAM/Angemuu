from flask import Blueprint, request, jsonify
from backend.db import db
from backend.models.calendar import Calendar

calendar_bp = Blueprint('calendar', __name__)

@calendar_bp.route('/', methods=['GET'])
def get_calendar():
    cal = Calendar.query.get('default')
    if not cal:
        cal = Calendar(id='default', name='Default Calendar')
        db.session.add(cal)
        db.session.commit()
    return jsonify({
        'id': cal.id,
        'name': cal.name,
        'non_working_days': cal.get_non_working_days()
    }), 200

@calendar_bp.route('/non_working_days', methods=['POST'])
def add_non_working_day():
    data = request.get_json() or {}
    iso_date = data.get('date')
    if not iso_date:
        return jsonify({'error': 'missing date'}), 400
    cal = Calendar.query.get('default')
    if not cal:
        cal = Calendar(id='default', name='Default Calendar')
        db.session.add(cal)
    cal.add_non_working_day(iso_date)
    db.session.commit()
    return jsonify({
        'id': cal.id,
        'name': cal.name,
        'non_working_days': cal.get_non_working_days()
    }), 201
