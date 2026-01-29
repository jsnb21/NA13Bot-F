from flask import Flask, render_template, request, redirect, url_for, jsonify, session
from tools import save_config, load_config, add_user, verify_user
import google.generativeai as genai
import os
from werkzeug.utils import secure_filename
from pathlib import Path

# simple session secret
app = Flask(__name__)
app.secret_key = os.environ.get('FLASK_SECRET', 'dev-secret')

# upload dir for logo files
UPLOAD_DIR = Path(__file__).parent / 'static' / 'uploads'
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
from functools import wraps
from flask import flash

# allowed logo extensions
ALLOWED_EXT = {'png', 'jpg', 'jpeg', 'gif', 'svg'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXT

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('user'):
            return redirect(url_for('login', next=request.path))
        return f(*args, **kwargs)
    return decorated

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
@login_required
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
@login_required
def dashboard():
    cfg = load_config()
    return render_template('clients/dashboard.html', cfg=cfg)

@app.route('/admin-client/orders')
@login_required
def orders():
    cfg = load_config()
    return render_template('clients/orders.html', cfg=cfg)

@app.route('/admin-client/menu')
@login_required
def menu():
    cfg = load_config()
    return render_template('clients/menu.html', cfg=cfg)

@app.route('/admin-client/customers')
@login_required
def customers():
    cfg = load_config()
    return render_template('clients/customers.html', cfg=cfg)

@app.route('/admin-client/reports')
@login_required
def reports():
    cfg = load_config()
    return render_template('clients/reports.html', cfg=cfg)

@app.route('/admin-client/settings', methods=['GET', 'POST'])
@login_required
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
@login_required
def ai_training():
    cfg = load_config()
    if request.method == 'POST':
        # Handle file uploads for AI training
        if 'training_files' in request.files:
            files = request.files.getlist('training_files')
            # Process uploaded files here
            pass
    return render_template('clients/ai-training.html', cfg=cfg)


@app.route('/login', methods=['GET', 'POST'])
def login():
    cfg = load_config()
    error = None
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        if not email or not password:
            error = 'Email and password are required.'
        else:
            ok = verify_user(email, password)
            if ok:
                session['user'] = email
                nxt = request.args.get('next') or request.form.get('next') or url_for('admin_client')
                return redirect(nxt)
            else:
                error = 'Invalid email or password.'
    return render_template('clients/login.html', cfg=cfg, error=error)


@app.route('/signup', methods=['GET', 'POST'])
def signup():
    cfg = load_config()
    error = None
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        confirm = request.form.get('confirm_password', '')
        establishment_name = request.form.get('establishment_name', '')
        main_color = request.form.get('main_color', '')
        sub_color = request.form.get('sub_color', '')

        # handle logo file upload
        logo_url = request.form.get('logo_url', '')
        logo_file = request.files.get('logo_file')
        if logo_file and logo_file.filename:
            if allowed_file(logo_file.filename):
                filename = secure_filename(logo_file.filename)
                dest = UPLOAD_DIR / filename
                logo_file.save(str(dest))
                # set path relative to static
                logo_url = f'/static/uploads/{filename}'
            else:
                error = 'Unsupported logo file type.'

        if not error:
            if not email or not password:
                error = 'Email and password are required.'
            elif password != confirm:
                error = 'Passwords do not match.'
            else:
                meta = {
                    'establishment_name': establishment_name,
                    'logo_url': logo_url,
                    'main_color': main_color,
                    'sub_color': sub_color
                }
                success = add_user(email, password, meta=meta)
                if not success:
                    error = 'A user with that email already exists.'
                if not error:
                    # merge branding into config
                    cfg.update({
                        'establishment_name': establishment_name,
                        'logo_url': logo_url,
                        'main_color': main_color,
                        'sub_color': sub_color
                    })
                    save_config(cfg)
                    return redirect(url_for('login'))

    return render_template('clients/signup.html', cfg=cfg, error=error)


@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect(url_for('login'))

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
