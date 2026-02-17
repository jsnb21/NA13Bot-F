"""
NA13Bot-F - Main Flask Application
====================================
Core Flask application entry point for the multi-tenant restaurant AI chatbot system.
Handles all HTTP routing, session management, file uploads, and coordination between
frontend, database, and AI services.

Key Responsibilities:
  - Flask app initialization and configuration
  - Authentication routes (signup, login, OTP verification)
  - Admin dashboard for restaurant owners
  - Chatbot interface for customers
  - File upload management (logos, training data, menu items)
  - Training data processing and indexing
  - Database initialization
  - Session and cookie management
  - AI training data integration

Main Page Routes:
  - GET / - Redirect to dashboard/login
  - GET /login - Login page
  - GET /signup - Signup page
  - GET /dashboard - Admin dashboard
  - GET /chatbot - Customer chatbot interface
  - GET /settings - Settings page
  - GET /ai-training - AI training management
  - GET /menu - Menu management
  - GET /orders - Order history
  - GET /reports - Analytics and reports

API Routes:
  - POST /upload-logo - Logo upload (admin)
  - POST /upload-training-file - Training file upload
  - POST /delete-training-file - Remove training file
  - GET /get-trained-brands - List trained restaurants
  - POST /save-settings - Save restaurant configuration
  - POST /save-menu-description - Update menu text
  - POST /api/* - Chatbot API endpoints (see chatbot/routes.py)

Features:
  - Multi-tenant restaurant support with isolated data
  - OTP-based authentication with 5-minute TTL
  - Flask-Turbo for seamless real-time navigation
  - Secure file handling with validation and sanitization
  - Training data manifest management
  - PDF processing support (via PyPDF)
  - CSV/JSON/DOCX file parsing
  - Database-backed configuration storage
  - Session-based access control

Configuration:
  - FLASK_SECRET: Session encryption key (from env or default)
  - ALLOWED_EXT: Logo file extensions (png, jpg, jpeg, gif, svg)
  - TRAINING_ALLOWED_EXT: Training file extensions (txt, pdf, docx, json, csv)
  - MAX_TRAINING_FILE_MB: Maximum training file size (50MB)
  - OTP_TTL_SECONDS: OTP validity (300 seconds / 5 minutes)

Key Functions:
  - allowed_file(): Validate logo file extensions
  - training_allowed_file(): Validate training file extensions
  - get_training_dir(): Get restaurant training directory path
  - get_training_manifest_path(): Get manifest.json path
  - load_training_manifest(): Load training file metadata
  - save_training_manifest(): Save training file metadata
  - save_training_upload_bytes(): Save training file to disk
  - extract_pdf_text(): Parse PDF files
  - extract_docx_text(): Parse DOCX files
  - extract_csv_text(): Parse CSV files

Dependencies:
  - Flask: Web framework
  - Flask-Turbo: Real-time page updates
  - Jinja2: Template rendering
  - PyPDF: PDF processing
  - psycopg: PostgreSQL driver
  - google.genai: Gemini AI API
"""

from flask import Flask, render_template, request, redirect, url_for, jsonify, session, Response
from flask_turbo import Turbo
from tools import save_config, load_config, add_user, verify_user, user_exists, get_user, update_user_meta
from config import init_db, get_connection, get_db_schema
import os
from werkzeug.utils import secure_filename
from pathlib import Path
import json
import csv
import io
import re
try:
    from pypdf import PdfReader
except Exception:
    PdfReader = None
try:
    from docx import Document
except Exception:
    Document = None
import time
import secrets
import uuid
from datetime import datetime, timezone
from chatbot.routes import chatbot_bp
from chatbot.training import build_training_context
import google.genai as genai
import base64
import psycopg
import smtplib
import ssl
from email.message import EmailMessage

# after app is created, before routes
init_db()

# simple session secret
app = Flask(__name__)
app.secret_key = os.environ.get('FLASK_SECRET', 'dev-secret')

# Initialize Turbo for seamless page navigation
turbo = Turbo(app)

# Add custom Jinja2 filter for regex operations
@app.template_filter('regex_findall')
def regex_findall_filter(text, pattern):
    """Find all matches of a regex pattern in text"""
    import re
    if not text:
        return []
    return re.findall(pattern, str(text))

app.register_blueprint(chatbot_bp)
# upload dir for logo files
UPLOAD_DIR = Path(__file__).parent / 'static' / 'uploads'
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
TRAINING_DIR = Path(__file__).parent / 'training_data'
TRAINING_DIR.mkdir(parents=True, exist_ok=True)
from functools import wraps
from flask import flash

# allowed logo extensions
ALLOWED_EXT = {'png', 'jpg', 'jpeg', 'gif', 'svg'}
TRAINING_ALLOWED_EXT = {'txt', 'pdf', 'docx', 'json', 'csv'}
MAX_TRAINING_FILE_MB = 50
OTP_TTL_SECONDS = 300

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXT


def training_allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in TRAINING_ALLOWED_EXT


def get_training_dir(restaurant_id: str):
    safe_id = str(restaurant_id) if restaurant_id else 'default'
    path = TRAINING_DIR / safe_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_training_manifest_path(restaurant_id: str):
    return get_training_dir(restaurant_id) / 'manifest.json'


def load_training_manifest(restaurant_id: str):
    manifest_path = get_training_manifest_path(restaurant_id)
    if manifest_path.exists():
        try:
            return json.loads(manifest_path.read_text())
        except Exception:
            return []
    return []


def save_training_manifest(restaurant_id: str, entries):
    manifest_path = get_training_manifest_path(restaurant_id)
    manifest_path.write_text(json.dumps(entries, indent=2, default=str))


def save_training_upload_bytes(restaurant_id: str, filename: str, data_bytes: bytes):
    if not filename:
        return None
    if not training_allowed_file(filename):
        return None
    training_dir = get_training_dir(restaurant_id)
    safe_name = secure_filename(filename)
    ext = Path(safe_name).suffix.lower()
    stored_name = f"{uuid.uuid4().hex}{ext}"
    dest = training_dir / stored_name
    dest.write_bytes(data_bytes)

    entry = {
        'id': uuid.uuid4().hex,
        'original_name': safe_name,
        'stored_name': stored_name,
        'uploaded_at': datetime.now(timezone.utc).isoformat(),
        'status': 'ready'
    }
    entries = load_training_manifest(restaurant_id)
    entries.append(entry)
    save_training_manifest(restaurant_id, entries)
    return entry


def parse_menu_txt(content: str):
    if not content:
        return []
    text = content.replace('\r\n', '\n').replace('\r', '\n')

    items = []
    heading_matches = list(re.finditer(r"\b([A-Z][A-Z &]{2,})\b(?=\s+NAME:)", text))
    headings = [(m.start(), m.group(1).strip()) for m in heading_matches]

    pattern = re.compile(
        r"NAME:\s*(.*?)\s*\|\s*PRICE:\s*(.*?)\s*\|\s*DESCRIPTION:\s*(.*?)(?=\s+(?:[A-Z][A-Z &]{2,}\s+)?NAME:|$)",
        re.DOTALL
    )

    for match in pattern.finditer(text):
        name = (match.group(1) or '').strip()
        if not name:
            continue
        price = (match.group(2) or '').strip()
        description = (match.group(3) or '').strip()
        category = 'Uncategorized'
        for pos, heading in reversed(headings):
            if pos < match.start():
                category = heading.title()
                break
        items.append({
            'name': name,
            'description': description,
            'price': price,
            'category': category,
            'status': 'Live'
        })

    if items:
        return items

    price_pattern = re.compile(r"(\$\s*\d+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?\s*(?:usd|php|php\.|aud|cad|eur)?)", re.IGNORECASE)
    for line in text.split('\n'):
        clean = line.strip()
        if not clean:
            continue
        match = price_pattern.search(clean)
        if not match:
            continue
        price = match.group(1).strip()
        name_part = clean[:match.start()].strip(" -:\t")
        desc_part = clean[match.end():].strip(" -:\t")
        if not name_part:
            continue
        items.append({
            'name': name_part,
            'description': desc_part,
            'price': price,
            'category': 'Uncategorized',
            'status': 'Live'
        })
    if items:
        return items

    rows = []
    reader = csv.reader(io.StringIO(content))
    for row in reader:
        if not row:
            continue
        cleaned = [cell.strip() for cell in row]
        if not any(cleaned):
            continue
        rows.append(cleaned)

    if not rows:
        return []

    first = [cell.lower() for cell in rows[0]]
    if 'name' in first and ('price' in first or 'description' in first):
        rows = rows[1:]

    for row in rows:
        name = row[0].strip() if len(row) > 0 else ''
        if not name:
            continue
        description = row[1].strip() if len(row) > 1 else ''
        price = row[2].strip() if len(row) > 2 else ''
        category = row[3].strip() if len(row) > 3 else 'Uncategorized'
        status = row[4].strip() if len(row) > 4 else 'Live'
        items.append({
            'name': name,
            'description': description,
            'price': price,
            'category': category or 'Uncategorized',
            'status': status or 'Live'
        })
    return items


def parse_menu_txt_with_ai(content: str):
    if not content:
        return []
    api_key = get_google_api_key()
    if not api_key:
        return []

    try:
        client = genai.Client(api_key=api_key)
        system_instruction = (
            "Extract ALL restaurant menu items from the provided text. DO NOT SKIP ANY ITEMS. "
            "Return JSON only: an array of objects with keys "
            "name, description, price, category, status. "
            "Use empty string when a field is missing. "
            "Preserve currency symbols if present in the price. "
            "If a section heading (e.g., APPETIZERS, ESPRESSO BEVERAGE) appears, use it as category. "
            "Default status to Live. "
            "DESCRIPTION RULES: The description should contain actual descriptive text about the item. "
            "Do NOT put standalone numbers (like calories, nutritional values) in the description. "
            "If there's no descriptive text, leave description as empty string. "
            "CRITICAL PRICING VARIANTS: If an item has multiple prices (sizes T/G/V, quantities 1ea/SET, portions, etc.), "
            "you MUST format the description field EXACTLY as: 'Options: T=160, G=165, V=180' or 'Options: 1ea=150, SET=280'. "
            "Use the format 'Options: LABEL=PRICE, LABEL=PRICE' where LABEL is the variant (size/quantity/type) and PRICE is the number. "
            "Always use 'Options:' as the prefix, preserve the original labels (T, G, V, 1ea, SET, Small, Large, etc.). "
            "Put the lowest price in the price field. "
            "Create ONE item per menu item name, not separate items per variant. "
            "COMPLETENESS: Extract EVERY item in the text. Count them if needed to ensure none are missing."
        )
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[{"role": "user", "parts": [{"text": content}]}],
            config=genai.types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type='application/json',
                temperature=0.2,
                max_output_tokens=8000
            )
        )
        text = (response.text or '').strip()
        if not text:
            return []
        if not text.startswith('['):
            start = text.find('[')
            end = text.rfind(']')
            if start != -1 and end != -1 and end > start:
                text = text[start:end + 1]
        data = json.loads(text)
        if isinstance(data, dict) and 'items' in data:
            data = data.get('items')
        if not isinstance(data, list):
            return []

        items = []
        for row in data:
            if not isinstance(row, dict):
                continue
            name = (row.get('name') or '').strip()
            if not name:
                continue
            description = (row.get('description') or '').strip()
            price = (row.get('price') or '').strip()
            category = (row.get('category') or '').strip() or 'Uncategorized'
            status = (row.get('status') or '').strip() or 'Live'
            items.append({
                'name': name,
                'description': description,
                'price': price,
                'category': category,
                'status': status
            })
        return items
    except Exception:
        return []


def extract_image_text_with_ai(data_bytes: bytes, mime_type: str):
    if not data_bytes:
        return ''
    api_key = get_google_api_key()
    if not api_key:
        return ''
    try:
        client = genai.Client(api_key=api_key)
        prompt = (
            "Extract ALL text from this restaurant menu image. This is CRITICAL - you must not skip any items.\n\n"
            "Instructions:\n"
            "- Extract EVERY SINGLE menu item visible in the image\n"
            "- Preserve the exact text as it appears\n"
            "- Keep each menu item on its own line\n"
            "- Preserve section headings (ESPRESSO, TEA, etc) in ALL CAPS\n"
            "- Include all prices and size labels (T, G, V, Small, Medium, Large, etc)\n"
            "- If items are in columns, read left to right, top to bottom\n"
            "- If text is small or faint, still extract it\n"
            "- Double-check you haven't missed any items\n\n"
            "Return ONLY the extracted text, nothing else. BE COMPLETE."
        )
        encoded = base64.b64encode(data_bytes).decode('ascii')
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[{
                "role": "user",
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": mime_type, "data": encoded}}
                ]
            }],
            config=genai.types.GenerateContentConfig(
                temperature=0.1,
                max_output_tokens=8000
            )
        )
        text = (response.text or '').strip()
        if not text:
            print("Warning: Gemini API returned empty response for image extraction")
        return text
    except Exception as e:
        print(f"Error extracting text from image: {str(e)}")
        return ''


def extract_pdf_text(data_bytes: bytes):
    if not PdfReader:
        return ''
    try:
        reader = PdfReader(io.BytesIO(data_bytes))
    except Exception:
        return ''
    parts = []
    for page in reader.pages:
        try:
            text = page.extract_text() or ''
        except Exception:
            text = ''
        if text:
            parts.append(text)
    return '\n'.join(parts)


def extract_docx_text(data_bytes: bytes):
    if not Document:
        return ''
    try:
        doc = Document(io.BytesIO(data_bytes))
    except Exception:
        return ''
    parts = []
    for paragraph in doc.paragraphs:
        text = (paragraph.text or '').strip()
        if text:
            parts.append(text)
    for table in doc.tables:
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells if cell.text]
            if cells:
                parts.append(' | '.join(cells))
    return '\n'.join(parts)

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('user'):
            return redirect(url_for('login', next=request.path))
        return f(*args, **kwargs)
    return decorated

def get_current_restaurant_id():
    rid = session.get('restaurant_id')
    if rid:
        email = session.get('user')
        ensure_brand_seed(rid, email)
        return rid
    email = session.get('user')
    if not email:
        return None
    user = get_user(email) or {}
    meta = user.get('meta') or {}
    rid = meta.get('restaurant_id')
    if not rid:
        rid = str(uuid.uuid4())
        update_user_meta(email, {'restaurant_id': rid})
    session['restaurant_id'] = rid
    ensure_brand_seed(rid, email)
    return rid


def ensure_brand_seed(restaurant_id: str, email: str):
    if not restaurant_id or not email:
        return
    current = load_config(restaurant_id)
    if current.get('establishment_name'):
        return
    user = get_user(email) or {}
    meta = user.get('meta') or {}
    seed = {
        'establishment_name': meta.get('establishment_name', ''),
        'logo_url': meta.get('logo_url', ''),
        'main_color': meta.get('main_color', ''),
        'sub_color': meta.get('sub_color', '')
    }
    if any(seed.values()):
        save_config(seed, restaurant_id)


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


def get_smtp_settings():
    host = os.environ.get('SMTP_HOST', '').strip()
    port_raw = os.environ.get('SMTP_PORT', '587').strip()
    try:
        port = int(port_raw)
    except ValueError:
        port = 587
    user = os.environ.get('SMTP_USER', '').strip()
    password = os.environ.get('SMTP_PASSWORD', '').strip()
    use_tls = os.environ.get('SMTP_USE_TLS', 'true').strip().lower() in ('1', 'true', 'yes', 'on')
    use_ssl = os.environ.get('SMTP_USE_SSL', 'false').strip().lower() in ('1', 'true', 'yes', 'on')
    from_email = os.environ.get('SMTP_FROM', '').strip() or user
    from_name = os.environ.get('SMTP_FROM_NAME', 'Resto AI').strip()
    return {
        'host': host,
        'port': port,
        'user': user,
        'password': password,
        'use_tls': use_tls,
        'use_ssl': use_ssl,
        'from_email': from_email,
        'from_name': from_name
    }


def should_show_otp_hint():
    return os.environ.get('OTP_DEBUG_SHOW', '').strip().lower() in ('1', 'true', 'yes', 'on')


def send_otp_email(to_email: str, code: str, purpose: str, cfg: dict = None):
    settings = get_smtp_settings()
    if not settings['host'] or not settings['from_email']:
        return False, 'SMTP is not configured.'

    cfg = cfg or {}
    brand = cfg.get('business_name') or cfg.get('establishment_name') or 'Resto AI'
    ttl_minutes = max(1, int(OTP_TTL_SECONDS / 60))
    subject = f"Your {brand} verification code"
    intro = "Use this code to finish signing in" if purpose == 'login' else "Use this code to finish creating your account"

    body = (
        f"{intro}.\n\n"
        f"Verification code: {code}\n"
        f"This code expires in {ttl_minutes} minutes.\n\n"
        f"If you did not request this, you can ignore this email."
    )

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = f"{settings['from_name']} <{settings['from_email']}>"
    msg['To'] = to_email
    msg['Auto-Submitted'] = 'auto-generated'
    msg.set_content(body)

    context = ssl.create_default_context()
    try:
        if settings['use_ssl']:
            with smtplib.SMTP_SSL(settings['host'], settings['port'], context=context) as server:
                if settings['user'] and settings['password']:
                    server.login(settings['user'], settings['password'])
                server.send_message(msg)
        else:
            with smtplib.SMTP(settings['host'], settings['port']) as server:
                if settings['use_tls']:
                    server.starttls(context=context)
                if settings['user'] and settings['password']:
                    server.login(settings['user'], settings['password'])
                server.send_message(msg)
    except Exception as exc:
        return False, str(exc)

    return True, None


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

# Configure Google AI - environment variable only
def get_google_api_key():
    # First check environment variable
    key = os.environ.get('GOOGLE_API_KEY', '')
    if key:
        return key
    return ''

@app.route('/')
def index():
    return redirect(url_for('login'))


@app.route('/chatbot')
def chatbot_route():
    # explicit route for /chatbot for convenience
    restaurant_id = session.get('restaurant_id')
    cfg = load_config(restaurant_id)
    return render_template('clients/chatbot.html', cfg=cfg)

@app.route('/api/models', methods=['GET'])
def api_models():
    """List available Gemini models."""
    api_key = get_google_api_key()
    if not api_key:
        return jsonify({'error': 'No API key configured'}), 400
    try:
        client = genai.Client(api_key=api_key)
        models = client.models.list()
        model_list = []
        for m in models:
            methods = getattr(m, 'supported_generation_methods', None)
            if not methods or 'generateContent' in methods:
                model_list.append(m.name)
        return jsonify({'models': model_list})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/chat', methods=['POST'])
@login_required
def admin_chat():
    """Handle admin chat messages for the help bot."""
    data = request.get_json()
    user_message = data.get('message', '')
    
    if not user_message:
        return jsonify({'error': 'No message provided'}), 400
    
    # Get fresh API key in case it was just configured
    api_key = get_google_api_key()
    if not api_key:
        return jsonify({'reply': 'AI is not configured. Please add your Google API key in the settings.'}), 200
    
    client = genai.Client(api_key=api_key)
    
    try:
        # Load config to get restaurant context
        restaurant_id = get_current_restaurant_id()
        cfg = load_config(restaurant_id)
        establishment_name = cfg.get('establishment_name', 'your restaurant')
        
        # Create admin-specific prompt
        system_prompt = f"""You are a helpful AI assistant for restaurant administrators.
You help with:
- Understanding the admin dashboard features
- Menu management questions
- Settings configuration
- AI training tips
- General restaurant management advice

Restaurant name: {establishment_name}

Respond in a friendly, helpful manner. Keep responses concise and focused on helping the administrator."""
        
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[
                {"role": "user", "parts": [{"text": user_message}]}
            ],
            config=genai.types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.7,
                max_output_tokens=500,
                top_p=0.9,
                top_k=40
            )
        )
        
        return jsonify({'reply': response.text})
    
    except Exception as e:
        return jsonify({'reply': f'Sorry, I encountered an error: {str(e)}'}), 500


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
    
    client = genai.Client(api_key=api_key)
    
    try:
        # Load config to get restaurant context
        restaurant_id = request.args.get('restaurant_id') or session.get('restaurant_id')
        cfg = load_config(restaurant_id)
        establishment_name = cfg.get('establishment_name', 'our restaurant')
        menu_text = cfg.get('menu_text', '')
        menu_items = cfg.get('menu_items', [])
        currency_symbol = cfg.get('currency_symbol', '₱')
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
                    line += f" ({currency_symbol}{price})"
                lines.append(line)
            menu_text = "\n".join(lines) if lines else menu_text
        if not menu_text:
            menu_text = 'No menu available'
        
        training_context = build_training_context(restaurant_id, user_message)

        # Create context-aware prompt
        system_prompt = f"""You are a helpful AI assistant for {establishment_name}, a restaurant chatbot.
You help customers with:
- Taking orders
- Answering questions about the menu
- Providing information about the restaurant

Menu:
{menu_text}

    Training data (reference only):
    {training_context}

Respond in a friendly, helpful manner. Keep responses concise and focused on helping the customer."""
        
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[
                {"role": "user", "parts": [{"text": user_message}]}
            ],
            config=genai.types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.7,
                max_output_tokens=500,
                top_p=0.9,
                top_k=40
            )
        )
        
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


@app.route('/', methods=['GET', 'POST'])
@login_required
def admin_client():
    if request.method == 'POST':
        restaurant_id = get_current_restaurant_id()
        data = {
            'establishment_name': request.form.get('establishment_name', ''),
            'logo_url': request.form.get('logo_url', ''),
            'color_hex': request.form.get('color_hex', ''),
            'font_family': request.form.get('font_family', ''),
            'menu_text': request.form.get('menu_text', ''),
            'image_urls': [u.strip() for u in request.form.get('image_urls', '').splitlines() if u.strip()]
        }
        save_config(data, restaurant_id)
        return redirect(url_for('admin_client'))
    restaurant_id = get_current_restaurant_id()
    cfg = load_config(restaurant_id)
    return render_template('clients/admin-client.html', cfg=cfg)

@app.route('/dashboard')
@login_required
def dashboard():
    restaurant_id = get_current_restaurant_id()
    cfg = load_config(restaurant_id)
    return render_template('clients/dashboard.html', cfg=cfg)

@app.route('/orders')
@login_required
def orders():
    restaurant_id = get_current_restaurant_id()
    cfg = load_config(restaurant_id)
    return render_template('clients/orders.html', cfg=cfg)

@app.route('/menu')
@login_required
def menu():
    restaurant_id = get_current_restaurant_id()
    cfg = load_config(restaurant_id)
    return render_template('clients/menu.html', cfg=cfg)


@app.route('/menu/add', methods=['POST'])
@login_required
def menu_add_item():
    restaurant_id = get_current_restaurant_id()
    cfg = load_config(restaurant_id)
    name = request.form.get('name', '').strip()
    description = request.form.get('description', '').strip()
    price = request.form.get('price', '').strip()
    category = request.form.get('category', '').strip() or 'Uncategorized'
    status = request.form.get('status', '').strip() or 'Live'
    image_url = request.form.get('image_url', '').strip()

    if not name:
        return redirect(url_for('menu'))

    items = cfg.get('menu_items', [])
    items.append({
        'name': name,
        'description': description,
        'price': price,
        'category': category,
        'status': status,
        'image_url': image_url
    })
    cfg['menu_items'] = items
    save_config(cfg, restaurant_id)
    return redirect(url_for('menu'))


@app.route('/menu/update', methods=['POST'])
@login_required
def menu_update_item():
    restaurant_id = get_current_restaurant_id()
    cfg = load_config(restaurant_id)
    index_raw = request.form.get('item_index', '').strip()
    try:
        index = int(index_raw)
    except ValueError:
        return redirect(url_for('menu'))

    items = cfg.get('menu_items', [])
    if index < 0 or index >= len(items):
        return redirect(url_for('menu'))

    name = request.form.get('name', '').strip()
    if not name:
        return redirect(url_for('menu'))

    items[index] = {
        'name': name,
        'description': request.form.get('description', '').strip(),
        'price': request.form.get('price', '').strip(),
        'category': request.form.get('category', '').strip() or 'Uncategorized',
        'status': request.form.get('status', '').strip() or 'Live',
        'image_url': request.form.get('image_url', '').strip()
    }
    cfg['menu_items'] = items
    save_config(cfg, restaurant_id)
    return redirect(url_for('menu'))


def _normalize_menu_key(value: str) -> str:
    text = (value or '').strip().lower()
    return re.sub(r'[^a-z0-9]+', '', text)


@app.route('/menu/upload', methods=['POST'])
@login_required
def menu_upload_menu_file():
    try:
        restaurant_id = get_current_restaurant_id()
        file = request.files.get('menu_file')
        if not file or not file.filename:
            return jsonify({'error': 'No file provided'}), 400
        filename = file.filename.lower()
        is_txt = filename.endswith('.txt')
        is_pdf = filename.endswith('.pdf')
        is_png = filename.endswith('.png')
        if not (is_txt or is_pdf or is_png):
            return jsonify({'error': 'Only .txt, .pdf, or .png files are supported'}), 400

        data_bytes = file.read()
        content = ''
        
        if is_pdf:
            content = extract_pdf_text(data_bytes)
            if not content:
                return jsonify({'error': 'Unable to extract text from PDF'}), 400
        elif is_png:
            mime_type = file.content_type or 'image/png'
            content = extract_image_text_with_ai(data_bytes, mime_type)
            if not content:
                return jsonify({'error': 'Unable to extract text from PNG. The AI service may be unavailable or the image may not contain readable text. Please try again or use a .txt or .pdf file instead.'}), 400
        else:
            content = data_bytes.decode('utf-8', errors='ignore')

        # Parse the extracted text into structured items
        items = parse_menu_txt_with_ai(content)
        if not items:
            items = parse_menu_txt(content)
        
        if not items:
            return jsonify({'error': 'No menu items found in file'}), 400

        # Deduplicate items by name (case-insensitive)
        seen_names = set()
        unique_items = []
        for item in items:
            name_lower = (item.get('name') or '').strip().lower()
            if name_lower and name_lower not in seen_names:
                seen_names.add(name_lower)
                unique_items.append(item)

        cfg = load_config(restaurant_id)
        existing_items = cfg.get('menu_items', [])
        image_map = {}
        for item in existing_items:
            key = _normalize_menu_key(item.get('name', ''))
            if key and item.get('image_url'):
                image_map[key] = item.get('image_url')

        for item in unique_items:
            key = _normalize_menu_key(item.get('name', ''))
            if key and key in image_map:
                item['image_url'] = image_map[key]

        cfg['menu_items'] = unique_items
        save_config(cfg, restaurant_id)

        save_training_upload_bytes(restaurant_id, file.filename, data_bytes)

        return jsonify({'saved': len(items)})
    except Exception as exc:
        app.logger.exception('Menu upload failed')
        return jsonify({'error': 'Menu upload failed', 'detail': str(exc)}), 500


@app.route('/menu/photos/upload', methods=['POST'])
@login_required
def menu_upload_photos():
    try:
        restaurant_id = get_current_restaurant_id()
        files = request.files.getlist('menu_photos')
        if not files:
            return jsonify({'error': 'No files provided'}), 400

        cfg = load_config(restaurant_id)
        items = cfg.get('menu_items', [])
        name_index = {}
        for idx, item in enumerate(items):
            key = _normalize_menu_key(item.get('name', ''))
            if key:
                name_index[key] = idx

        matched = 0
        unmatched = []
        uploaded_count = 0

        schema = get_db_schema()
        for file in files:
            if not file or not file.filename:
                continue
            if not allowed_file(file.filename):
                unmatched.append(file.filename)
                continue

            safe_name = secure_filename(file.filename)
            if not safe_name:
                unmatched.append(file.filename)
                continue

            # Read file bytes and get MIME type
            mime_type = file.content_type or 'application/octet-stream'
            file_bytes = file.read()
            uploaded_count += 1

            # Match filename to menu item
            key = _normalize_menu_key(Path(file.filename).stem)
            if key in name_index:
                idx = name_index[key]
                item_id = items[idx].get('id')
                
                if item_id:
                    # Store in database
                    with get_connection() as conn:
                        with conn.cursor() as cur:
                            cur.execute(
                                psycopg.sql.SQL(
                                    """
                                    UPDATE {}.menu_items
                                    SET image_data = %s, image_mime = %s
                                    WHERE id = %s AND restaurant_id = %s
                                    """
                                ).format(psycopg.sql.Identifier(schema)),
                                [file_bytes, mime_type, item_id, restaurant_id]
                            )
                matched += 1
            else:
                unmatched.append(file.filename)

        cfg['menu_items'] = items
        save_config(cfg, restaurant_id)

        return jsonify({
            'uploaded': uploaded_count,
            'matched': matched,
            'unmatched': unmatched
        })
    except Exception as exc:
        app.logger.exception('Menu photo upload failed')
        return jsonify({'error': 'Menu photo upload failed', 'detail': str(exc)}), 500


# Menu Photo Serving Route
@app.route('/menu/photo/<photo_id>', methods=['GET'])
@login_required
def menu_get_photo(photo_id):
    """Serve a menu item photo from the database."""
    try:
        restaurant_id = get_current_restaurant_id()
        schema = get_db_schema()
        
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    psycopg.sql.SQL(
                        """
                        SELECT image_data, image_mime
                        FROM {}.menu_items
                        WHERE id = %s AND restaurant_id = %s
                        """
                    ).format(psycopg.sql.Identifier(schema)),
                    [photo_id, restaurant_id]
                )
                row = cur.fetchone()

        if not row or not row[0]:
            return jsonify({'error': 'Photo not found'}), 404

        image_data = row[0]
        mime_type = row[1] or 'image/jpeg'

        response = Response(image_data, mimetype=mime_type)
        response.headers['Cache-Control'] = 'public, max-age=31536000'
        return response
    except Exception as exc:
        app.logger.exception('Failed to fetch menu photo')
        return jsonify({'error': 'Failed to fetch photo'}), 500

# Order Management Routes
from tools import save_order, get_orders, update_order_status

@app.route('/api/orders/create', methods=['POST'])
def api_create_order():
    """Create a new order from chatbot or client."""
    try:
        data = request.get_json()
        restaurant_id = request.args.get('restaurant_id') or session.get('restaurant_id')
        
        if not restaurant_id:
            return jsonify({'error': 'No restaurant ID provided'}), 400
        
        order_data = {
            'customer_name': data.get('customer_name', ''),
            'customer_email': data.get('customer_email', ''),
            'items': data.get('items', []),
            'total_amount': data.get('total_amount', 0),
            'status': 'pending'
        }
        
        saved = save_order(restaurant_id, order_data)
        if not saved:
            return jsonify({'error': 'Failed to save order'}), 500

        order_id = saved.get('id')
        order_number = saved.get('order_number')
        
        return jsonify({
            'success': True,
            'order_id': order_id,
            'order_number': order_number,
            'message': f'Order #{order_id} placed successfully!'
        }), 201
    except Exception as e:
        app.logger.exception('Order creation failed')
        return jsonify({'error': 'Failed to create order', 'detail': str(e)}), 500


@app.route('/api/orders/list', methods=['GET'])
@login_required
def api_list_orders():
    """List all orders for a restaurant."""
    try:
        restaurant_id = get_current_restaurant_id()
        orders = get_orders(restaurant_id)
        return jsonify({'orders': orders})
    except Exception as e:
        app.logger.exception('Listing orders failed')
        return jsonify({'error': 'Failed to list orders', 'detail': str(e)}), 500


@app.route('/api/orders/<order_id>/status', methods=['POST'])
@login_required
def api_update_order_status(order_id):
    """Update order status."""
    try:
        data = request.get_json()
        new_status = data.get('status', '').strip().lower()
        
        if new_status not in ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled']:
            return jsonify({'error': 'Invalid status'}), 400
        
        if update_order_status(order_id, new_status):
            return jsonify({'success': True, 'message': f'Order status updated to {new_status}'})
        else:
            return jsonify({'error': 'Failed to update order status'}), 500
    except Exception as e:
        app.logger.exception('Order status update failed')
        return jsonify({'error': 'Failed to update order status', 'detail': str(e)}), 500

@app.route('/customers')
@login_required
def customers():
    restaurant_id = get_current_restaurant_id()
    cfg = load_config(restaurant_id)
    return render_template('clients/customers.html', cfg=cfg)

@app.route('/reports')
@login_required
def reports():
    restaurant_id = get_current_restaurant_id()
    cfg = load_config(restaurant_id)
    return render_template('clients/reports.html', cfg=cfg)

@app.route('/settings', methods=['GET', 'POST'])
@login_required
def settings():
    restaurant_id = get_current_restaurant_id()
    cfg = load_config(restaurant_id)
    if request.method == 'POST':
        # collect branding & display fields and merge into existing config
        currency_choice = request.form.get('currency_choice', '').strip()
        currency_code = cfg.get('currency_code', 'PHP')
        currency_symbol = cfg.get('currency_symbol', '₱')
        currency_map = {
            'PHP': '₱',
            'USD': '$',
            'EUR': '€',
            'GBP': '£',
            'JPY': '¥',
            'AUD': 'A$',
            'CAD': 'C$',
            'SGD': 'S$',
            'INR': '₹'
        }
        if currency_choice:
            if '|' in currency_choice:
                parts = currency_choice.split('|', 1)
                currency_code = (parts[0] or '').strip() or currency_code
                currency_symbol = (parts[1] or '').strip() or currency_symbol
            else:
                currency_code = currency_choice
                currency_symbol = currency_map.get(currency_choice, currency_symbol)
        data = {
            'establishment_name': request.form.get('establishment_name', cfg.get('establishment_name', '')),
            'logo_url': request.form.get('logo_url', cfg.get('logo_url', '')),
            'main_color': request.form.get('main_color', request.form.get('color_hex', cfg.get('main_color', cfg.get('color_hex','')))),
            'sub_color': request.form.get('sub_color', cfg.get('sub_color', '')),
            'font_family': request.form.get('font_family', cfg.get('font_family', '')),
            'menu_text': request.form.get('menu_text', cfg.get('menu_text', '')),
            'image_urls': [u.strip() for u in request.form.get('image_urls', "\n".join(cfg.get('image_urls', []))).splitlines() if u.strip()],
            'business_name': request.form.get('business_name', cfg.get('business_name', '')),
            'business_email': request.form.get('business_email', cfg.get('business_email', '')),
            'business_phone': request.form.get('business_phone', cfg.get('business_phone', '')),
            'business_address': request.form.get('business_address', cfg.get('business_address', '')),
            'open_time': request.form.get('open_time', cfg.get('open_time', '')),
            'close_time': request.form.get('close_time', cfg.get('close_time', '')),
            'tax_rate': request.form.get('tax_rate', cfg.get('tax_rate', '')),
            'currency_code': currency_code,
            'currency_symbol': currency_symbol
        }
        # merge with existing config to avoid wiping other keys
        # handle logo upload (optional)
        logo_url = request.form.get('logo_url', cfg.get('logo_url',''))
        logo_file = request.files.get('logo_file')
        if logo_file and logo_file.filename:
            if allowed_file(logo_file.filename):
                safe_name = secure_filename(logo_file.filename)
                ext = Path(safe_name).suffix.lower()
                logo_filename = f"{uuid.uuid4().hex}{ext}"
                logo_dir = UPLOAD_DIR / restaurant_id
                logo_dir.mkdir(parents=True, exist_ok=True)
                dest = logo_dir / logo_filename
                logo_file.save(str(dest))
                logo_url = f'/static/uploads/{restaurant_id}/{logo_filename}'
                data['logo_uploaded_by'] = session.get('user')
                data['logo_uploaded_at'] = datetime.now(timezone.utc)
            else:
                flash('Unsupported logo file type.')

        data['logo_url'] = logo_url

        # handle chatbot avatar upload (optional)
        avatar_url = request.form.get('chatbot_avatar_url', cfg.get('chatbot_avatar',''))
        avatar_file = request.files.get('chatbot_avatar_file')
        if avatar_file and avatar_file.filename:
            if allowed_file(avatar_file.filename):
                safe_name = secure_filename(avatar_file.filename)
                ext = Path(safe_name).suffix.lower()
                avatar_filename = f"{uuid.uuid4().hex}{ext}"
                avatar_dir = UPLOAD_DIR / restaurant_id
                avatar_dir.mkdir(parents=True, exist_ok=True)
                dest = avatar_dir / avatar_filename
                avatar_file.save(str(dest))
                avatar_url = f'/static/uploads/{restaurant_id}/{avatar_filename}'
                data['chatbot_avatar_uploaded_by'] = session.get('user')
                data['chatbot_avatar_uploaded_at'] = datetime.now(timezone.utc)
            else:
                flash('Unsupported avatar file type.')

        data['chatbot_avatar'] = avatar_url

        cfg.update(data)
        save_config(cfg, restaurant_id)
        return redirect(url_for('settings'))
    return render_template('clients/settings.html', cfg=cfg)


@app.route('/settings/clear-menu', methods=['POST'])
@login_required
def settings_clear_menu():
    restaurant_id = get_current_restaurant_id()
    cfg = load_config(restaurant_id)
    cfg['menu_items'] = []
    save_config(cfg, restaurant_id)
    return jsonify({'cleared': True})

@app.route('/ai-training', methods=['GET', 'POST'])
@login_required
def ai_training():
    restaurant_id = get_current_restaurant_id()
    cfg = load_config(restaurant_id)
    return render_template('clients/ai-training.html', cfg=cfg)


@app.route('/ai-training/files', methods=['GET'])
@login_required
def ai_training_files():
    restaurant_id = get_current_restaurant_id()
    entries = load_training_manifest(restaurant_id)
    training_dir = get_training_dir(restaurant_id)

    filtered = []
    for entry in entries:
        stored_name = entry.get('stored_name')
        if not stored_name:
            continue
        file_path = training_dir / stored_name
        if not file_path.exists():
            continue
        size_bytes = file_path.stat().st_size
        filtered.append({
            'id': entry.get('id'),
            'original_name': entry.get('original_name'),
            'stored_name': stored_name,
            'size_bytes': size_bytes,
            'uploaded_at': entry.get('uploaded_at'),
            'status': entry.get('status', 'ready')
        })

    filtered.sort(key=lambda x: x.get('uploaded_at') or '', reverse=True)
    return jsonify({'files': filtered})


@app.route('/ai-training/upload', methods=['POST'])
@login_required
def ai_training_upload():
    restaurant_id = get_current_restaurant_id()
    if 'training_files' not in request.files:
        return jsonify({'error': 'No files provided'}), 400

    files = request.files.getlist('training_files')
    if not files:
        return jsonify({'error': 'No files provided'}), 400

    entries = load_training_manifest(restaurant_id)
    training_dir = get_training_dir(restaurant_id)
    saved = []
    errors = []

    for file in files:
        filename = file.filename or ''
        if not filename:
            continue
        if not training_allowed_file(filename):
            errors.append({'file': filename, 'error': 'Unsupported file type'})
            continue
        file.seek(0, os.SEEK_END)
        size_bytes = file.tell()
        file.seek(0)
        if size_bytes > MAX_TRAINING_FILE_MB * 1024 * 1024:
            errors.append({'file': filename, 'error': 'File too large'})
            continue

        safe_name = secure_filename(filename)
        ext = Path(safe_name).suffix.lower()
        stored_name = f"{uuid.uuid4().hex}{ext}"
        dest = training_dir / stored_name
        file.save(str(dest))

        entry = {
            'id': uuid.uuid4().hex,
            'original_name': safe_name,
            'stored_name': stored_name,
            'uploaded_at': datetime.now(timezone.utc).isoformat(),
            'status': 'ready'
        }
        entries.append(entry)
        saved.append(entry)

    save_training_manifest(restaurant_id, entries)
    return jsonify({'saved': saved, 'errors': errors})


@app.route('/ai-training/files/<file_id>', methods=['DELETE'])
@login_required
def ai_training_delete(file_id):
    restaurant_id = get_current_restaurant_id()
    entries = load_training_manifest(restaurant_id)
    training_dir = get_training_dir(restaurant_id)

    remaining = []
    deleted = False
    for entry in entries:
        if entry.get('id') != file_id:
            remaining.append(entry)
            continue
        stored_name = entry.get('stored_name')
        if stored_name:
            file_path = training_dir / stored_name
            if file_path.exists():
                try:
                    file_path.unlink()
                except Exception:
                    pass
        deleted = True

    save_training_manifest(restaurant_id, remaining)
    if not deleted:
        return jsonify({'error': 'File not found'}), 404
    return jsonify({'deleted': True})


def _build_training_preview_text(file_path: Path):
    suffix = file_path.suffix.lower()
    if suffix == '.pdf':
        return extract_pdf_text(file_path.read_bytes())
    if suffix == '.docx':
        return extract_docx_text(file_path.read_bytes())
    try:
        raw_text = file_path.read_text(encoding='utf-8', errors='ignore')
    except Exception:
        return ''
    if suffix == '.json':
        try:
            parsed = json.loads(raw_text)
            return json.dumps(parsed, indent=2)
        except Exception:
            return raw_text
    return raw_text


@app.route('/ai-training/files/<file_id>/preview', methods=['GET'])
@login_required
def ai_training_preview(file_id):
    restaurant_id = get_current_restaurant_id()
    entries = load_training_manifest(restaurant_id)
    training_dir = get_training_dir(restaurant_id)

    entry = next((e for e in entries if e.get('id') == file_id), None)
    if not entry:
        return jsonify({'error': 'File not found'}), 404

    stored_name = entry.get('stored_name')
    if not stored_name:
        return jsonify({'error': 'File not found'}), 404

    file_path = training_dir / stored_name
    if not file_path.exists():
        return jsonify({'error': 'File not found'}), 404

    preview_text = _build_training_preview_text(file_path)
    if not preview_text:
        return jsonify({'error': 'Unable to extract preview text'}), 400

    max_chars = 4000
    truncated = len(preview_text) > max_chars
    preview = preview_text[:max_chars]

    return jsonify({
        'id': entry.get('id'),
        'name': entry.get('original_name'),
        'ext': file_path.suffix.lower(),
        'preview': preview,
        'truncated': truncated
    })


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
            sent, send_error = send_otp_email(email, otp_code, 'login', cfg)
            otp_hint = otp_code if (should_show_otp_hint() or not sent) else None
            notice = 'We sent a verification code to your email.' if sent else None
            warning = None if sent else f"Email delivery failed: {send_error}. Use the code shown below."
            return render_template(
                'auth/otp_verify.html',
                cfg=cfg,
                email=email,
                purpose='login',
                otp_hint=otp_hint,
                notice=notice,
                warning=warning
            )
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
        session.pop('restaurant_id', None)
        get_current_restaurant_id()
        return redirect(url_for('dashboard'))
    otp_code = session.get('otp', {}).get('code')
    otp_hint = otp_code if should_show_otp_hint() else None
    return render_template('auth/otp_verify.html', cfg=cfg, email=email, purpose='login', error=error, otp_hint=otp_hint)


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
                sent, send_error = send_otp_email(email, otp_code, 'signup', cfg)
                otp_hint = otp_code if (should_show_otp_hint() or not sent) else None
                notice = 'We sent a verification code to your email.' if sent else None
                warning = None if sent else f"Email delivery failed: {send_error}. Use the code shown below."
                return render_template(
                    'auth/otp_verify.html',
                    cfg=cfg,
                    email=email,
                    purpose='signup',
                    otp_hint=otp_hint,
                    notice=notice,
                    warning=warning
                )

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
        otp_hint = otp_code if should_show_otp_hint() else None
        return render_template('auth/otp_verify.html', cfg=cfg, email=email, purpose='signup', error=error, otp_hint=otp_hint)

    restaurant_id = str(uuid.uuid4())
    meta = {
        'establishment_name': pending.get('establishment_name', ''),
        'logo_url': pending.get('logo_url', ''),
        'main_color': pending.get('main_color', ''),
        'sub_color': pending.get('sub_color', ''),
        'restaurant_id': restaurant_id
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
    save_config(cfg, restaurant_id)
    session.pop('pending_signup', None)
    session.pop('otp', None)
    return redirect(url_for('login'))


@app.route('/logout')
def logout():
    session.pop('user', None)
    session.pop('restaurant_id', None)
    return redirect(url_for('login'))

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
