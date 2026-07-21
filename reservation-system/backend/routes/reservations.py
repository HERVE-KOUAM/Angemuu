from flask import Blueprint, request, jsonify
from datetime import datetime

reservations_bp = Blueprint('reservations', __name__)

# In-memory placeholder storage (replace with DB in next steps)
_RESERVATIONS = {}

@reservations_bp.route('/', methods=['GET'])
def list_reservations():
    return jsonify([r for r in _RESERVATIONS.values()]), 200

@reservations_bp.route('/', methods=['POST'])
def create_reservation():
    data = request.get_json() or {}
    # Very small validation for skeleton
    required = ('id','user_id','start','end')
    if not all(k in data for k in required):
        return jsonify({'error': 'missing fields'}), 400
    # store raw data for now
    _RESERVATIONS[data['id']] = data
    return jsonify(data), 201
