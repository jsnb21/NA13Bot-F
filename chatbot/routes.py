"""
Chatbot API Routes Module
=========================
Defines Flask API endpoints for chatbot functionality. Handles incoming chat
messages, processes AI responses, extracts orders, and manages conversation flow.

Main Components:
  - extract_order_items(): Parses chatbot responses to extract ordered items
  - Flask Blueprint Routes:
    * /api/config - Retrieve restaurant configuration
    * /api/models - List available Gemini models
    * /api/chat - Handle chat messages and generate responses

Key Features:
  - Multi-turn conversation with history tracking
  - Automatic order extraction from AI responses
  - Dynamic menu formatting with prices and descriptions
  - Restaurant-specific context building
  - Currency symbol support
  - Pattern-based order item parsing:
    * "2x Item Name" format
    * "Item Name (price)" format
    * Quantity tracking
  - Training data integration for context-aware responses
  - Order placement trigger detection

Dependencies:
  - GeminiChatbot: AI response generation
  - build_system_prompt: Prompt construction
  - build_training_context: Training data retrieval
  - Flask session: User authentication and restaurant context
"""

from flask import Blueprint, request, jsonify, session
from tools import load_config, save_order, get_next_order_number
from chatbot.ai import GeminiChatbot
from chatbot.prompts import build_system_prompt
from chatbot.training import build_training_context
import re
from datetime import date, datetime


STATUS_TRIGGER_PATTERN = re.compile(r'\[CHECK_ORDER_STATUS:(.+?)\]')
READY_TO_ORDER_MARKER = '[READY_TO_ORDER]'

_CONFIG_EXCLUDED_FIELDS = {
    'logo_data',
    'logo_mime',
    'chatbot_avatar_data',
    'chatbot_avatar_mime'
}


def _json_safe_config(cfg: dict) -> dict:
    if not isinstance(cfg, dict):
        return {}

    safe = {}
    for key, value in cfg.items():
        if key in _CONFIG_EXCLUDED_FIELDS:
            continue

        if isinstance(value, memoryview):
            continue
        if isinstance(value, (bytes, bytearray)):
            continue
        if isinstance(value, (datetime, date)):
            safe[key] = value.isoformat()
            continue

        safe[key] = value

    return safe


def _resolve_restaurant_id():
    restaurant_id = request.args.get('restaurant_id') or session.get('restaurant_id')
    if restaurant_id:
        return restaurant_id

    user_email = session.get('user')
    if not user_email:
        return None

    from tools import get_user
    user = get_user(user_email) or {}
    meta = user.get('meta') or {}
    restaurant_id = meta.get('restaurant_id') or user.get('restaurant_id')
    if restaurant_id:
        session['restaurant_id'] = restaurant_id
    return restaurant_id


def _format_price(price_value, currency_symbol):
    raw = str(price_value or '').strip()
    if not raw:
        return ''
    cleaned = re.sub(r'[^0-9.]', '', raw)
    try:
        value = float(cleaned)
        return f"{currency_symbol}{value:,.2f}"
    except ValueError:
        return f"{currency_symbol}{raw.replace(currency_symbol, '').strip()}"


def _short_desc(desc_value):
    text = str(desc_value or '').strip()
    if not text:
        return ''
    return f"{text[:87]}..." if len(text) > 90 else text


def _build_menu_text(cfg):
    menu_text = cfg.get('menu_text', '')
    menu_items = cfg.get('menu_items', []) or []
    currency_symbol = cfg.get('currency_symbol', '₱')
    if not menu_items:
        return menu_text or 'No menu available', menu_items

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
            desc = _short_desc(item.get('description'))
            price = _format_price(item.get('price'), currency_symbol)
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

    formatted = "\n".join(lines).strip()
    return (formatted or menu_text or 'No menu available'), menu_items


def _build_order_status_response(response_text, restaurant_id):
    if STATUS_TRIGGER_PATTERN.search(response_text) is None:
        return None

    match = STATUS_TRIGGER_PATTERN.search(response_text)
    customer_name = (match.group(1) or '').strip() if match else ''
    if not customer_name:
        return None

    from tools import get_order_by_customer
    order = get_order_by_customer(restaurant_id, customer_name=customer_name)

    if not order:
        not_found_msg = (
            f"I couldn't find any recent orders for {customer_name}. "
            "Could you please verify the name or provide your order number?"
        )
        return {
            'response': STATUS_TRIGGER_PATTERN.sub(not_found_msg, response_text)
        }

    status_map = {
        'pending': 'received and is waiting to be prepared',
        'preparing': 'currently being prepared in the kitchen',
        'ready': 'ready for pickup',
        'completed': 'completed and delivered'
    }
    status_text = status_map.get(order['status'], order['status'])
    items = order.get('items', [])
    items_text = ', '.join([f"{item.get('quantity')}x {item.get('name')}" for item in items])
    status_response = (
        f"Hi {order['customer_name']}! I found your order #{order['order_number']} "
        f"for table {order['table_number']}. Your order ({items_text}) is {status_text}. "
    )

    if order['status'] == 'pending':
        status_response += 'It should be started soon!'
    elif order['status'] == 'preparing':
        status_response += 'The kitchen is working on it now!'
    elif order['status'] == 'ready':
        status_response += 'You can pick it up now!'
    elif order['status'] == 'completed':
        status_response += 'Thank you for your order!'

    return {
        'response': STATUS_TRIGGER_PATTERN.sub(status_response, response_text),
        'order_status': order
    }


def _build_chat_response_payload(response_text, menu_items):
    order_items = extract_order_items(response_text, menu_items)
    if READY_TO_ORDER_MARKER in response_text:
        clean_response = response_text.replace(READY_TO_ORDER_MARKER, '').strip()
        total = sum((item['price'] * item['quantity']) for item in order_items)
        return {
            'response': clean_response,
            'order_ready': True,
            'order_items': order_items,
            'order_total': total
        }

    response_data = {'response': response_text}
    if order_items:
        total = sum((item['price'] * item['quantity']) for item in order_items)
        response_data['current_items'] = order_items
        response_data['current_total'] = total
    return response_data

def extract_order_items(response_text, menu_items):
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
    restaurant_id = _resolve_restaurant_id()
    cfg = load_config(restaurant_id)
    return jsonify(_json_safe_config(cfg))

@chatbot_bp.route('/models', methods=['GET'])
def api_models():
    """List available Gemini models."""
    try:
        models = ai.list_models()
        return jsonify({'models': models})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@chatbot_bp.route('/orders/session', methods=['GET'])
def api_order_session():
    restaurant_id = _resolve_restaurant_id()
    if not restaurant_id:
        return jsonify({'error': 'No restaurant ID provided'}), 400

    order_number = session.get('order_number')
    if not order_number:
        order_number = get_next_order_number(restaurant_id)
        session['order_number'] = order_number

    return jsonify({'order_number': order_number})
    
@chatbot_bp.route('/chat', methods=['POST'])
def api_chat():
    """Handle chat messages."""
    data = request.get_json()
    user_message = data.get('message', '')
    conversation_history = data.get('history', [])
    cart_items = data.get('cart_items', []) or []
    cart_context = (data.get('cart_context') or '').strip()
    
    if not user_message:
        return jsonify({'error': 'No message provided'}), 400
    
    restaurant_id = _resolve_restaurant_id()
    cfg = load_config(restaurant_id)
    establishment_name = cfg.get('establishment_name', 'our restaurant')
    menu_text, menu_items = _build_menu_text(cfg)

    training_context = build_training_context(restaurant_id, user_message)
    if not cart_context and cart_items:
        currency = cfg.get('currency_symbol', '₱')
        parts = []
        for item in cart_items:
            name = (item.get('name') or '').strip()
            try:
                quantity = int(item.get('quantity') or 0)
            except (TypeError, ValueError):
                quantity = 0
            try:
                price = float(item.get('price') or 0)
            except (TypeError, ValueError):
                price = 0
            if not name or quantity <= 0:
                continue
            parts.append(f"{quantity}x {name} ({currency}{(price * quantity):.2f})")
        if parts:
            cart_context = ', '.join(parts)

    system_prompt = build_system_prompt(establishment_name, menu_text, training_context, cart_context)
    response = ai.get_response(user_message, system_prompt, conversation_history)

    status_payload = _build_order_status_response(response, restaurant_id)
    if status_payload:
        return jsonify(status_payload)

    return jsonify(_build_chat_response_payload(response, menu_items))


@chatbot_bp.route('/orders/place', methods=['POST'])
@chatbot_bp.route('/orders/create', methods=['POST'])
def api_place_order():
    """Place an order from the chatbot or legacy client endpoint."""
    try:
        data = request.get_json() or {}
        restaurant_id = _resolve_restaurant_id()

        if not restaurant_id:
            return jsonify({'error': 'No restaurant ID provided'}), 400

        order_data = {
            'customer_name': data.get('customer_name', '').strip(),
            'table_number': (data.get('table_number') or data.get('customer_email') or '').strip(),
            'items': data.get('items', []),
            'total_amount': data.get('total_amount', 0),
            'status': 'pending'
        }

        if not order_data['customer_name']:
            return jsonify({'error': 'Customer name is required'}), 400
        if not order_data['table_number']:
            return jsonify({'error': 'Table number is required'}), 400
        if not order_data['items']:
            return jsonify({'error': 'Order must contain at least one item'}), 400

        session_order_number = session.get('order_number')
        saved = save_order(restaurant_id, order_data, session_order_number)
        if not saved:
            return jsonify({'error': 'Failed to save order'}), 500

        order_id = saved.get('id')
        order_number = saved.get('order_number')
        session['order_number'] = int(order_number or 0) + 1

        return jsonify({
            'success': True,
            'order_id': order_id,
            'order_number': order_number,
            'next_order_number': session.get('order_number'),
            'message': f'Order #{order_id} confirmed! Thank you for your order.',
            'total': order_data['total_amount']
        }), 201
    except Exception as e:
        return jsonify({'error': 'Failed to place order', 'detail': str(e)}), 500

@chatbot_bp.route('/orders/list', methods=['GET'])
def api_get_orders():
    """Get all orders for a restaurant."""
    try:
        restaurant_id = _resolve_restaurant_id()
        if not restaurant_id:
            return jsonify({'error': 'No restaurant ID provided'}), 400
        
        from tools import get_orders, update_order_status
        orders = get_orders(restaurant_id, limit=100)
        
        return jsonify({
            'success': True,
            'orders': orders
        })
    except Exception as e:
        return jsonify({'error': 'Failed to fetch orders', 'detail': str(e)}), 500


@chatbot_bp.route('/orders/update-status', methods=['POST'])
def api_update_order_status():
    """Update order status."""
    try:
        data = request.get_json() or {}
        restaurant_id = _resolve_restaurant_id()
        order_id = data.get('order_id')
        new_status = data.get('status')

        if not restaurant_id or not order_id or not new_status:
            return jsonify({'error': 'Missing required fields'}), 400

        from tools import update_order_status
        success = update_order_status(order_id, new_status)

        if not success:
            return jsonify({'error': 'Failed to update order status'}), 500

        return jsonify({'success': True, 'message': f'Order status updated to {new_status}'})
    except Exception as e:
        return jsonify({'error': 'Failed to update order', 'detail': str(e)}), 500


@chatbot_bp.route('/orders/<order_id>/status', methods=['POST'])
def api_update_order_status_legacy(order_id):
    """Legacy compatibility endpoint for updating order status by path parameter."""
    try:
        restaurant_id = _resolve_restaurant_id()
        data = request.get_json() or {}
        new_status = (data.get('status') or '').strip().lower()

        if not restaurant_id or not order_id or not new_status:
            return jsonify({'error': 'Missing required fields'}), 400

        from tools import update_order_status
        success = update_order_status(order_id, new_status)
        if not success:
            return jsonify({'error': 'Failed to update order status'}), 500

        return jsonify({'success': True, 'message': f'Order status updated to {new_status}'})
    except Exception as e:
        return jsonify({'error': 'Failed to update order', 'detail': str(e)}), 500


@chatbot_bp.route('/orders/check-status', methods=['POST'])
def api_check_order_status():
    """Check order status by customer name or order number."""
    try:
        data = request.get_json()
        restaurant_id = _resolve_restaurant_id()
        customer_name = data.get('customer_name', '').strip()
        order_number = data.get('order_number')
        
        if not restaurant_id:
            return jsonify({'error': 'No restaurant ID provided'}), 400
        
        if not customer_name and not order_number:
            return jsonify({'error': 'Please provide customer name or order number'}), 400
        
        from tools import get_order_by_customer
        order = get_order_by_customer(restaurant_id, customer_name, order_number)
        
        if not order:
            return jsonify({'found': False, 'message': 'No order found'})
        
        return jsonify({
            'found': True,
            'order': order
        })
    except Exception as e:
        return jsonify({'error': 'Failed to check order status', 'detail': str(e)}), 500