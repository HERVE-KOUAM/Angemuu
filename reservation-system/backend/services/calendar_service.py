from datetime import date

# Small helper functions for calendar operations

def is_available(date_to_check: date, non_working_days: list) -> bool:
    return date_to_check.isoformat() not in [d for d in non_working_days]

def add_non_working_day(calendar: dict, day_iso: str):
    if day_iso not in calendar.get('non_working_days', []):
        calendar.setdefault('non_working_days', []).append(day_iso)
