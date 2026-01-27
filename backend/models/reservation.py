from datetime import datetime
from extensions import db


class Reservation(db.Model):
    __tablename__ = "reservations"

    id = db.Column(db.Integer, primary_key=True)
    restaurant_id = db.Column(db.Integer, db.ForeignKey("restaurants.id"), nullable=False)
    date = db.Column(db.String(16), nullable=False)
    time = db.Column(db.String(16), nullable=False)
    party_size = db.Column(db.Integer, nullable=False)
    name = db.Column(db.String(255), nullable=False)
    phone = db.Column(db.String(64), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.Index("idx_reservation_restaurant_slot", "restaurant_id", "date", "time"),
    )
