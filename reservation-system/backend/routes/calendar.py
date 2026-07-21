from flask import Blueprint, request, jsonify
from datetime import datetime, date

calendar_bp = Blueprint('calendar', __name__)

# Simple in-memory calendar representation
_CALENDARS = {
    'default': {
        'id': 'default',
        'name': 'Default Calendar',
        'non_working_days': []
    }
}

@calendar_bp.route('/', methods=['GET'])
def get_calendar():
    return jsonify(_CALENDARS['default']), 200

@calendar_bp.route('/non_working_days', methods=['POST'])
def add_non_working_day():
    data = request.get_json() or {}
    if 'date' not in data:
        return jsonify({'error': 'missing date'}), 400
    _CALENDARS['default']['non_working_days'].append(data['date'])
    return jsonify(_CALENDARS['default']), 201
