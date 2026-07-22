FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend /app/backend
ENV PYTHONUNBUFFERED=1

CMD ["python", "backend/app.py"]
