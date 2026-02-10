from flask import Blueprint, request, jsonify, session
from tools import load_config
from chatbot.ai import GeminiChatbot
from chatbot.prompts import build_system_prompt
from training import build_training_context

chatbot_bp = Blueprint('chatbot', __name__, url_prefix = '/api')
ai =GeminiChatbot()

@chatbot_bp.route('/config', methods=['GET'])
def api_config():
    """Return admin config as JSON"""
    restaurant_id = request.args.get('restaurant_id') or session.get('restaurant_id')
    cfg = load_config(restaurant_id)
    return jsonify(cfg)

@chatbot_bp.route('/models', methods=['GET'])
def api_models():
    """List available Gemini models."""
    try:
        models = ai.list_models()
        return jsonify({'models': models})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@chatbot_bp.route('/chat', methods=['POST'])
def api_chat():
    """Handle chat messages."""
    data = request.get_json()
    user_message = data.get('message', '')
    
    if not user_message:
        return jsonify({'error': 'No message provided'}), 400
    
    restaurant_id = request.args.get('restaurant_id') or session.get('restaurant_id')
    cfg = load_config(restaurant_id)
    establishment_name = cfg.get('establishment_name', 'our restaurant')
    menu_text = cfg.get('menu_text', '')
    menu_items = cfg.get('menu_items', [])
    if menu_items:
        lines = []
        for item in menu_items:
            name = (item.get('name') or '').strip()
            desc = (item.get('description') or '').strip()
            price = (item.get('price') or '').strip()
            if not name:
                continue
            line = name
            if desc:
                line += f" — {desc}"
            if price:
                line += f" (₱{price})"
            lines.append(line)
        menu_text = "\n".join(lines) if lines else menu_text
    if not menu_text:
        menu_text = 'No menu available'

    training_context = build_training_context(restaurant_id, user_message)
    system_prompt = build_system_prompt(establishment_name, menu_text, training_context)
    response = ai.get_response(user_message, system_prompt)
    
    return jsonify({'response' : response})