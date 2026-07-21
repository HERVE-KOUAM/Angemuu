from flask import Flask
from dotenv import load_dotenv

load_dotenv()

from backend.routes.reservations import reservations_bp
from backend.routes.calendar import calendar_bp

app = Flask(__name__)

# Register blueprints
app.register_blueprint(reservations_bp, url_prefix='/api/reservations')
app.register_blueprint(calendar_bp, url_prefix='/api/calendar')

@app.route('/')
def index():
    return {'message': 'Reservation System API'}, 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
