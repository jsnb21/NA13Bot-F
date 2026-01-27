from flask import Blueprint, request, jsonify, current_app
from extensions import db
from models.restaurant import ApiKey
from models.settings import Setting
from services.menu_ingest import ingest_menu

bp = Blueprint("resto_admin", __name__)


def resolve_restaurant_id(api_key: str):
    if not api_key:
        return None
    record = ApiKey.query.filter_by(key=api_key, active=True).first()
    return record.restaurant_id if record else None


@bp.route("/system-instruction", methods=["POST"])
def set_system_instruction():
    api_key = request.headers.get("X-API-Key")
    restaurant_id = resolve_restaurant_id(api_key)
    if not restaurant_id:
        return jsonify({"error": "invalid api key"}), 401

    payload = request.get_json(force=True)
    instruction = payload.get("instruction", "").strip()
    if not instruction:
        return jsonify({"error": "instruction required"}), 400

    setting = Setting.query.filter_by(restaurant_id=restaurant_id, key="system_instruction").first()
    if not setting:
        setting = Setting(restaurant_id=restaurant_id, key="system_instruction", value=instruction)
        db.session.add(setting)
    else:
        setting.value = instruction
    db.session.commit()

    return jsonify({"status": "saved"})


@bp.route("/menus", methods=["POST"])
def upload_menu():
    api_key = request.headers.get("X-API-Key")
    restaurant_id = resolve_restaurant_id(api_key)
    if not restaurant_id:
        return jsonify({"error": "invalid api key"}), 401

    payload = request.get_json(force=True)
    menu_text = payload.get("menu_text", "").strip()
    if not menu_text:
        return jsonify({"error": "menu_text required"}), 400

    ingest_menu(
        api_key=current_app.config.get("GEMINI_API_KEY", ""),
        restaurant_id=restaurant_id,
        menu_text=menu_text,
        chroma_path=current_app.config["CHROMA_PATH"],
        collection_name=current_app.config["CHROMA_COLLECTION"],
    )

    return jsonify({"status": "ingested"})
