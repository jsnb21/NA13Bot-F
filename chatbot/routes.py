from flask import Blueprint, request, jsonify, session
from tools import load_config, save_order
from chatbot.ai import GeminiChatbot
from chatbot.prompts import build_system_prompt
from chatbot.training import build_training_context
import json
import re

def extract_order_items(response_text, menu_items, currency_symbol):
    """Extract order items from the bot's response."""
    items = []
    
    # Try to find patterns like "1 Grilled Salmon (18.99)" or "Grilled Salmon x1"
    for menu_item in menu_items:
        menu_name = menu_item.get('name', '').strip()
        menu_price = menu_item.get('price', '').strip()
        
        if not menu_name or not menu_price:
            continue
        
        # Remove any currency symbols and non-numeric characters except decimal point
        cleaned_price = re.sub(r'[^\d.]', '', menu_price)
        price_float = float(cleaned_price) if cleaned_price else 0.0
        
        # Pattern 1: "1 Item Name" or "2x Item Name"
        pattern1 = rf'(\d+)\s*x?\s*{re.escape(menu_name)}'
        match = re.search(pattern1, response_text, re.IGNORECASE)
        if match:
            quantity = int(match.group(1))
            items.append({
                'name': menu_name,
                'quantity': quantity,
                'price': price_float
            })
            continue
        
        # Pattern 2: "Item Name (price)"
        pattern2 = rf'{re.escape(menu_name)}\s*\(\$?[\d.]+\)'
        match = re.search(pattern2, response_text, re.IGNORECASE)
        if match:
            # Count how many times this item appears
            count = len(re.findall(pattern2, response_text, re.IGNORECASE))
            items.append({
                'name': menu_name,
                'quantity': count,
                'price': price_float
            })
    
    return items

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
    conversation_history = data.get('history', [])
    
    if not user_message:
        return jsonify({'error': 'No message provided'}), 400
    
    restaurant_id = request.args.get('restaurant_id') or session.get('restaurant_id')
    cfg = load_config(restaurant_id)
    establishment_name = cfg.get('establishment_name', 'our restaurant')
    menu_text = cfg.get('menu_text', '')
    menu_items = cfg.get('menu_items', [])
    currency_symbol = cfg.get('currency_symbol', '₱')
    if menu_items:
        def normalize_price(price_value):
            raw = str(price_value or '').strip()
            if not raw:
                return ''
            cleaned = re.sub(r'[^0-9.]', '', raw)
            try:
                value = float(cleaned)
                return f"{currency_symbol}{value:,.2f}"
            except ValueError:
                return f"{currency_symbol}{raw.replace(currency_symbol, '').strip()}"

        def short_desc(desc_value):
            text = str(desc_value or '').strip()
            if not text:
                return ''
            return f"{text[:87]}..." if len(text) > 90 else text

        grouped = {}
        for item in menu_items:
            name = (item.get('name') or '').strip()
            if not name:
                continue
            category = (item.get('category') or 'Other').strip() or 'Other'
            grouped.setdefault(category, []).append(item)

        lines = []
        for category in sorted(grouped.keys(), key=lambda x: x.lower()):
            lines.append(f"{category}:")
            for idx, item in enumerate(grouped[category], start=1):
                name = (item.get('name') or '').strip()
                desc = short_desc(item.get('description'))
                price = normalize_price(item.get('price'))
                image_url = (item.get('image_url') or '').strip()
                line = f"{idx}) {name}"
                if desc:
                    line += f" — {desc}"
                if price:
                    line += f" ({price})"
                if image_url:
                    line += f" • Photo: {image_url}"
                lines.append(line)
            lines.append('')

        menu_text = "\n".join(lines).strip() if lines else menu_text
    if not menu_text:
        menu_text = 'No menu available'

    training_context = build_training_context(restaurant_id, user_message)
    system_prompt = build_system_prompt(establishment_name, menu_text, training_context)
    response = ai.get_response(user_message, system_prompt, conversation_history)
    
    # Check if response indicates order is ready
    if '[READY_TO_ORDER]' in response:
        # Remove the marker from the response
        clean_response = response.replace('[READY_TO_ORDER]', '').strip()
        
        # Parse order items from the response
        order_items = extract_order_items(clean_response, menu_items, currency_symbol)
        total = sum((item['price'] * item['quantity']) for item in order_items)
        
        return jsonify({
            'response': clean_response,
            'order_ready': True,
            'order_items': order_items,
            'order_total': total
        })
    
    return jsonify({'response': response})


@chatbot_bp.route('/orders/place', methods=['POST'])
def api_place_order():
    """Place an order from the chatbot."""
    try:
        data = request.get_json()
        restaurant_id = request.args.get('restaurant_id') or session.get('restaurant_id')
        
        if not restaurant_id:
            return jsonify({'error': 'No restaurant ID provided'}), 400
        
        cfg = load_config(restaurant_id)
        
        order_data = {
            'customer_name': data.get('customer_name', '').strip(),
            'table_number': data.get('table_number', '').strip(),
            'items': data.get('items', []),
            'total_amount': data.get('total_amount', 0),
            'status': 'pending'
        }
        
        # Validate required fields
        if not order_data['customer_name']:
            return jsonify({'error': 'Customer name is required'}), 400
        
        if not order_data['table_number']:
            return jsonify({'error': 'Table number is required'}), 400
        
        if not order_data['items']:
            return jsonify({'error': 'Order must contain at least one item'}), 400
        
        # Save the order
        order_id = save_order(restaurant_id, order_data)
        if not order_id:
            return jsonify({'error': 'Failed to save order'}), 500
        
        return jsonify({
            'success': True,
            'order_id': order_id,
            'message': f'Order #{order_id} confirmed! Thank you for your order.',
            'total': order_data['total_amount']
        }), 201
    except Exception as e:
        return jsonify({'error': 'Failed to place order', 'detail': str(e)}), 500
