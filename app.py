from flask import Flask, render_template, request, redirect, url_for, jsonify
from tools import save_config, load_config
import google.generativeai as genai
import os

app = Flask(__name__)
<<<<<<< Updated upstream
=======
app.secret_key = os.environ.get('FLASK_SECRET', 'dev-secret')

# upload dir for logo files
UPLOAD_DIR = Path(__file__).parent / 'static' / 'uploads'
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
from functools import wraps
from flask import flash

# allowed logo extensions
ALLOWED_EXT = {'png', 'jpg', 'jpeg', 'gif', 'svg'}
ALLOWED_PDF = {'pdf'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXT

def allowed_pdf(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_PDF

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('user'):
            return redirect(url_for('login', next=request.path))
        return f(*args, **kwargs)
    return decorated
>>>>>>> Stashed changes

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
        cfg = load_config()
        cfg.update({
            'global_model': request.form.get('global_model', cfg.get('global_model', 'Gemini 2.0 Flash')),
            'system_prompt': request.form.get('system_prompt', cfg.get('system_prompt', '')),
            'enable_gpt52_codex_all_clients': True if request.form.get('enable_gpt52_codex_all_clients') == 'on' else False
        })
        save_config(cfg)
        return redirect(url_for('superadmin'))
    cfg = load_config()
    return render_template('superadmin/superadmin.html', cfg=cfg)


@app.route('/admin-client', methods=['GET', 'POST'])
def admin_client():
    if request.method == 'POST':
        cfg = load_config()
        data = {
            'establishment_name': request.form.get('establishment_name', ''),
            'logo_url': request.form.get('logo_url', ''),
            'color_hex': request.form.get('color_hex', ''),
            'font_family': request.form.get('font_family', ''),
            'menu_text': request.form.get('menu_text', ''),
            'image_urls': [u.strip() for u in request.form.get('image_urls', '').splitlines() if u.strip()]
        }

        pdf_file = request.files.get('pdf_file')
        if pdf_file and pdf_file.filename and allowed_pdf(pdf_file.filename):
            filename = secure_filename(pdf_file.filename)
            dest = UPLOAD_DIR / filename
            pdf_file.save(str(dest))
            data['menu_pdf_url'] = f'/static/uploads/{filename}'
            data['menu_pdf_name'] = filename

        cfg.update(data)
        save_config(cfg)
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

<<<<<<< Updated upstream
@app.route('/admin-client/menu')
=======
@app.route('/admin-client/menu', methods=['GET', 'POST'])
@login_required
>>>>>>> Stashed changes
def menu():
    cfg = load_config()
    if request.method == 'POST':
        pdf_file = request.files.get('menu_pdf')
        if pdf_file and pdf_file.filename and allowed_pdf(pdf_file.filename):
            filename = secure_filename(pdf_file.filename)
            dest = UPLOAD_DIR / filename
            pdf_file.save(str(dest))
            cfg.update({
                'menu_pdf_url': f'/static/uploads/{filename}',
                'menu_pdf_name': filename
            })
            save_config(cfg)
        return redirect(url_for('menu'))
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

<<<<<<< Updated upstream
=======

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
                return redirect(url_for('dashboard'))
            else:
                error = 'Invalid email or password.'
    return render_template('auth/login.html', cfg=cfg, error=error)


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

    return render_template('auth/signup.html', cfg=cfg, error=error)


@app.route('/logout')
def logout():
    session.pop('user', None)
    return redirect(url_for('login'))

>>>>>>> Stashed changes
if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
