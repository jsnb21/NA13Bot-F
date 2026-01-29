from flask import Flask, render_template, request, redirect, url_for, jsonify
from tools import save_config, load_config
import google.generativeai as genai
import os

app = Flask(__name__)

# Configure Google AI - check environment variable or config file
def get_google_api_key():
    # First check environment variable
    key = os.environ.get('GOOGLE_API_KEY', '')
    if key:
        return key
    # Then check config file
    cfg = load_config()
    return cfg.get('google_api_key', '')

GOOGLE_API_KEY = get_google_api_key()
if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)

@app.route('/')
def index():
    return render_template('clients/chatbot.html')


@app.route('/chatbot')
def chatbot_route():
    # explicit route for /chatbot for convenience
    return render_template('clients/chatbot.html')


@app.route('/api/config', methods=['GET'])
def api_config():
    """Return the current admin config as JSON for the chatbot to consume."""
    cfg = load_config()
    return jsonify(cfg)

@app.route('/api/models', methods=['GET'])
def api_models():
    """List available Gemini models."""
    api_key = get_google_api_key()
    if not api_key:
        return jsonify({'error': 'No API key configured'}), 400
    try:
        genai.configure(api_key=api_key)
        models = genai.list_models()
        model_list = [m.name for m in models if 'generateContent' in m.supported_generation_methods]
        return jsonify({'models': model_list})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/chat', methods=['POST'])
def api_chat():
    """Handle chat messages and return AI responses."""
    data = request.get_json()
    user_message = data.get('message', '')
    
    if not user_message:
        return jsonify({'error': 'No message provided'}), 400
    
    # Get fresh API key in case it was just configured
    api_key = get_google_api_key()
    if not api_key:
        return jsonify({'response': 'AI is not configured. Please add your Google API key in the settings.'}), 200
    
    # Configure with the current key
    genai.configure(api_key=api_key)
    
    try:
        # Load config to get restaurant context
        cfg = load_config()
        establishment_name = cfg.get('establishment_name', 'our restaurant')
        menu_text = cfg.get('menu_text', 'No menu available')
        
        # Create context-aware prompt
        system_prompt = f"""You are a helpful AI assistant for {establishment_name}, a restaurant chatbot.
You help customers with:
- Taking orders
- Answering questions about the menu
- Providing information about the restaurant

Menu:
{menu_text}

Respond in a friendly, helpful manner. Keep responses concise and focused on helping the customer."""
        
        # Initialize Gemini model (free tier compatible)
        model = genai.GenerativeModel('models/gemini-2.5-flash')
        
        # Generate response
        response = model.generate_content(f"{system_prompt}\n\nCustomer: {user_message}\nAssistant:")
        
        return jsonify({'response': response.text})
    
    except Exception as e:
        return jsonify({'response': f'Sorry, I encountered an error: {str(e)}'}), 500

@app.route('/admin', methods=['GET', 'POST'])
def admin():
    # keep legacy /admin route but redirect to the new /superadmin URL
    return redirect(url_for('superadmin'))


@app.route('/superadmin', methods=['GET', 'POST'])
def superadmin():
    if request.method == 'POST':
        cfg = request.form.get('config', '')
        save_config({'config': cfg})
        return redirect(url_for('superadmin'))
    cfg = load_config()
    return render_template('superadmin/superadmin.html', config=cfg.get('config', ''))


@app.route('/admin-client', methods=['GET', 'POST'])
def admin_client():
    if request.method == 'POST':
        data = {
            'establishment_name': request.form.get('establishment_name', ''),
            'logo_url': request.form.get('logo_url', ''),
            'color_hex': request.form.get('color_hex', ''),
            'font_family': request.form.get('font_family', ''),
            'menu_text': request.form.get('menu_text', ''),
            'image_urls': [u.strip() for u in request.form.get('image_urls', '').splitlines() if u.strip()]
        }
        save_config(data)
        return redirect(url_for('admin_client'))
    cfg = load_config()
    return render_template('clients/admin-client.html', cfg=cfg)

@app.route('/admin-client/dashboard')
def dashboard():
    cfg = load_config()
    return render_template('clients/dashboard.html', cfg=cfg)

@app.route('/admin-client/orders')
def orders():
    cfg = load_config()
    return render_template('clients/orders.html', cfg=cfg)

@app.route('/admin-client/menu')
def menu():
    cfg = load_config()
    return render_template('clients/menu.html', cfg=cfg)

@app.route('/admin-client/customers')
def customers():
    cfg = load_config()
    return render_template('clients/customers.html', cfg=cfg)

@app.route('/admin-client/reports')
def reports():
    cfg = load_config()
    return render_template('clients/reports.html', cfg=cfg)

@app.route('/admin-client/settings', methods=['GET', 'POST'])
def settings():
    cfg = load_config()
    if request.method == 'POST':
        # collect branding & display fields and merge into existing config
        data = {
            'establishment_name': request.form.get('establishment_name', ''),
            'logo_url': request.form.get('logo_url', ''),
            'main_color': request.form.get('main_color', request.form.get('color_hex','')),
            'sub_color': request.form.get('sub_color', ''),
            'font_family': request.form.get('font_family', ''),
            'menu_text': request.form.get('menu_text', ''),
            'image_urls': [u.strip() for u in request.form.get('image_urls', '').splitlines() if u.strip()],
            'business_name': request.form.get('business_name', cfg.get('business_name', '')),
            'business_email': request.form.get('business_email', cfg.get('business_email', '')),
            'business_phone': request.form.get('business_phone', cfg.get('business_phone', '')),
            'business_address': request.form.get('business_address', cfg.get('business_address', '')),
            'open_time': request.form.get('open_time', cfg.get('open_time', '')),
            'close_time': request.form.get('close_time', cfg.get('close_time', '')),
            'tax_rate': request.form.get('tax_rate', cfg.get('tax_rate', ''))
        }
        # merge with existing config to avoid wiping other keys
        cfg.update(data)
        save_config(cfg)
        return redirect(url_for('settings'))
    return render_template('clients/settings.html', cfg=cfg)

@app.route('/admin-client/ai-training', methods=['GET', 'POST'])
def ai_training():
    cfg = load_config()
    if request.method == 'POST':
        # Handle file uploads for AI training
        if 'training_files' in request.files:
            files = request.files.getlist('training_files')
            # Process uploaded files here
            pass
    return render_template('clients/ai-training.html', cfg=cfg)

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
