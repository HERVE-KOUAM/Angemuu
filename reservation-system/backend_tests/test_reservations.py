import json
from datetime import datetime, timedelta


def test_create_and_list_reservation(client):
    # create a reservation
    start = datetime.utcnow().isoformat()
    end = (datetime.utcnow() + timedelta(hours=1)).isoformat()
    payload = {
        'user_id': 'user-1',
        'start': start,
        'end': end,
        'notes': 'Test reservation'
    }
    resp = client.post('/api/reservations/', data=json.dumps(payload), content_type='application/json')
    assert resp.status_code == 201
    created = resp.get_json()
    assert created['user_id'] == 'user-1'
    assert created['notes'] == 'Test reservation'

    # list reservations
    resp2 = client.get('/api/reservations/')
    assert resp2.status_code == 200
    items = resp2.get_json()
    assert isinstance(items, list)
    assert any(r['id'] == created['id'] for r in items)
