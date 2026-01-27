from typing import Dict
from extensions import db
from models.reservation import Reservation


def check_availability(date: str, time: str, party_size: int, restaurant_id: int) -> Dict:
    """Check if a reservation slot is available for a restaurant."""
    existing = Reservation.query.filter_by(
        restaurant_id=restaurant_id, date=date, time=time
    ).count()
    return {"available": existing == 0, "restaurant_id": restaurant_id}


check_availability.__gemini_schema__ = {
    "type": "OBJECT",
    "properties": {
        "date": {"type": "STRING"},
        "time": {"type": "STRING"},
        "party_size": {"type": "INTEGER"},
        "restaurant_id": {"type": "INTEGER"},
    },
}


def create_reservation(
    date: str, time: str, party_size: int, name: str, phone: str, restaurant_id: int
) -> Dict:
    """Create a reservation if the slot is free for a restaurant."""
    existing = Reservation.query.filter_by(
        restaurant_id=restaurant_id, date=date, time=time
    ).first()
    if existing:
        return {"created": False, "reason": "slot_taken"}
    res = Reservation(
        restaurant_id=restaurant_id,
        date=date,
        time=time,
        party_size=party_size,
        name=name,
        phone=phone,
    )
    db.session.add(res)
    db.session.commit()
    return {"created": True, "reservation_id": res.id}


create_reservation.__gemini_schema__ = {
    "type": "OBJECT",
    "properties": {
        "date": {"type": "STRING"},
        "time": {"type": "STRING"},
        "party_size": {"type": "INTEGER"},
        "name": {"type": "STRING"},
        "phone": {"type": "STRING"},
        "restaurant_id": {"type": "INTEGER"},
    },
}
