from flask import Blueprint, request, jsonify
from extensions import db
from models.restaurant import Restaurant, ApiKey

bp = Blueprint("super_admin", __name__)


@bp.route("/restaurants", methods=["POST"])
def create_restaurant():
    payload = request.get_json(force=True)
    name = payload.get("name")
    if not name:
        return jsonify({"error": "name required"}), 400

    restaurant = Restaurant(name=name)
    db.session.add(restaurant)
    db.session.commit()

    api_key_value = ApiKey.generate_key()
    api_key = ApiKey(restaurant_id=restaurant.id, key=api_key_value)
    db.session.add(api_key)
    db.session.commit()

    return jsonify({
        "restaurant_id": restaurant.id,
        "api_key": api_key_value,
    }), 201
