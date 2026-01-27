from flask import Flask, render_template, request, redirect, url_for
from tools import save_config, load_config

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('chatbot.html')

@app.route('/admin', methods=['GET', 'POST'])
def admin():
    if request.method == 'POST':
        cfg = request.form.get('config', '')
        save_config({'config': cfg})
        return redirect(url_for('admin'))
    cfg = load_config()
    return render_template('admin.html', config=cfg.get('config', ''))

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
