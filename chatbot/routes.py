from flask import Blueprint, request, jsonify
from tools import load_config
from chatbot.ai import GeminiChatbot
from chatbot.prompts import build_system_prompt

chatbot_bp = Blueprint('chatbot', __name__, url_prefix = '/api')
ai =GeminiChatbot()

@chatbot_bp.route('/config', methods=['GET'])
def api_config():
    """Return admin config as JSON"""
    cfg = load_config()
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
    
    cfg = load_config()
    establishment_name = cfg.get('establishment_name', 'our restaurant')
    menu_text = cfg.get('menu_text', 'No menu available')
    
    system_prompt = build_system_prompt(establishment_name, menu_text)
    response = ai.get_response(user_message, system_prompt)
    
    return jsonify({'response' : response})