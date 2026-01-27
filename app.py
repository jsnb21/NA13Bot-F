from flask import Flask, render_template, request, redirect, url_for, jsonify
from tools import save_config, load_config

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('chatbot.html')


@app.route('/chatbot')
def chatbot_route():
    # explicit route for /chatbot for convenience
    return render_template('chatbot.html')


@app.route('/api/config', methods=['GET'])
def api_config():
    """Return the current admin config as JSON for the chatbot to consume."""
    cfg = load_config()
    return jsonify(cfg)

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
    return render_template('superadmin.html', config=cfg.get('config', ''))


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
    return render_template('admin-client.html', cfg=cfg)

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
