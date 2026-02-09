from flask import Flask, render_template, request, redirect, url_for, jsonify, session
from tools import save_config, load_config, add_user, user_exists
import google.generativeai as genai
import os
from werkzeug.utils import secure_filename
from pathlib import Path
import time
import secrets

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
OTP_TTL_SECONDS = 300

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXT

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('user'):
            return redirect(url_for('login', next=request.path))
        return f(*args, **kwargs)
    return decorated


def generate_otp_code():
    return f"{secrets.randbelow(1000000):06d}"


def set_otp(email: str, purpose: str):
    code = generate_otp_code()
    session['otp'] = {
        'email': email,
        'code': code,
        'purpose': purpose,
        'expires_at': time.time() + OTP_TTL_SECONDS
    }
    return code


def verify_otp(email: str, code: str, purpose: str):
    otp = session.get('otp')
    if not otp:
        return False, 'No OTP request found.'
    if otp.get('email') != email or otp.get('purpose') != purpose:
        return False, 'OTP request does not match.'
    if time.time() > otp.get('expires_at', 0):
        return False, 'OTP has expired.'
    if otp.get('code') != code:
        return False, 'Invalid OTP.'
    return True, None

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
    return redirect(url_for('login'))


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
        menu_text = cfg.get('menu_text', '')
        menu_items = cfg.get('menu_items', [])
        if menu_items:
            lines = []
            for item in menu_items:
                name = item.get('name', '').strip()
                desc = item.get('description', '').strip()
                price = item.get('price', '').strip()
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
        config_val = request.form.get('config', '')
        save_config({'config': config_val})
        return redirect(url_for('superadmin'))
    cfg = load_config()
    return render_template('superadmin/superadmin.html', cfg=cfg)


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


@app.route('/admin-client/menu/add', methods=['POST'])
@login_required
def menu_add_item():
    cfg = load_config()
    name = request.form.get('name', '').strip()
    description = request.form.get('description', '').strip()
    price = request.form.get('price', '').strip()
    category = request.form.get('category', '').strip() or 'Uncategorized'
    status = request.form.get('status', '').strip() or 'Live'

    if not name:
        return redirect(url_for('menu'))

    items = cfg.get('menu_items', [])
    items.append({
        'name': name,
        'description': description,
        'price': price,
        'category': category,
        'status': status
    })
    cfg['menu_items'] = items
    save_config(cfg)
    return redirect(url_for('menu'))

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
        if not email:
            error = 'Email is required.'
        elif not user_exists(email):
            error = 'No account found with that email.'
        else:
            otp_code = set_otp(email, 'login')
            return render_template('auth/otp_verify.html', cfg=cfg, email=email, purpose='login', otp_hint=otp_code)
    return render_template('auth/login.html', cfg=cfg, error=error)


@app.route('/login/verify', methods=['POST'])
def login_verify():
    cfg = load_config()
    email = request.form.get('email', '').strip().lower()
    code = request.form.get('otp', '').strip()
    ok, error = verify_otp(email, code, 'login')
    if ok:
        session.pop('otp', None)
        session['user'] = email
        return redirect(url_for('dashboard'))
    otp_code = session.get('otp', {}).get('code')
    return render_template('auth/otp_verify.html', cfg=cfg, email=email, purpose='login', error=error, otp_hint=otp_code)


@app.route('/signup', methods=['GET', 'POST'])
def signup():
    cfg = load_config()
    error = None
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
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
            if not email:
                error = 'Email is required.'
            elif user_exists(email):
                error = 'A user with that email already exists.'
            else:
                session['pending_signup'] = {
                    'email': email,
                    'establishment_name': establishment_name,
                    'logo_url': logo_url,
                    'main_color': main_color,
                    'sub_color': sub_color
                }
                otp_code = set_otp(email, 'signup')
                return render_template('auth/otp_verify.html', cfg=cfg, email=email, purpose='signup', otp_hint=otp_code)

    return render_template('auth/signup.html', cfg=cfg, error=error)


@app.route('/signup/verify', methods=['POST'])
def signup_verify():
    cfg = load_config()
    pending = session.get('pending_signup') or {}
    email = request.form.get('email', '').strip().lower()
    if not pending or pending.get('email') != email:
        error = 'Signup session not found. Please start again.'
        return render_template('auth/signup.html', cfg=cfg, error=error)

    code = request.form.get('otp', '').strip()
    ok, error = verify_otp(email, code, 'signup')
    if not ok:
        otp_code = session.get('otp', {}).get('code')
        return render_template('auth/otp_verify.html', cfg=cfg, email=email, purpose='signup', error=error, otp_hint=otp_code)

    meta = {
        'establishment_name': pending.get('establishment_name', ''),
        'logo_url': pending.get('logo_url', ''),
        'main_color': pending.get('main_color', ''),
        'sub_color': pending.get('sub_color', '')
    }
    success = add_user(email, password=None, meta=meta)
    if not success:
        error = 'A user with that email already exists.'
        return render_template('auth/signup.html', cfg=cfg, error=error)

    cfg.update({
        'establishment_name': pending.get('establishment_name', ''),
        'logo_url': pending.get('logo_url', ''),
        'main_color': pending.get('main_color', ''),
        'sub_color': pending.get('sub_color', '')
    })
    save_config(cfg)
    session.pop('pending_signup', None)
    session.pop('otp', None)
    return redirect(url_for('login'))


@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect(url_for('login'))

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
