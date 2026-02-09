import json
from pathlib import Path


CFG_PATH = Path(__file__).parent / 'config.json'
USERS_PATH = Path(__file__).parent / 'users.json'

from werkzeug.security import generate_password_hash, check_password_hash

def load_config():
    if CFG_PATH.exists():
        return json.loads(CFG_PATH.read_text())
    return {}

def save_config(data: dict):
    CFG_PATH.write_text(json.dumps(data, indent=2))
    return True


def load_users():
    if USERS_PATH.exists():
        return json.loads(USERS_PATH.read_text())
    return {}


def save_users(data: dict):
    USERS_PATH.write_text(json.dumps(data, indent=2))
    return True


def add_user(email: str, password: str = None, meta: dict = None):
    users = load_users()
    if email in users:
        return False
    password_hash = ''
    if password:
        password_hash = generate_password_hash(password)
    users[email] = {
        'password_hash': password_hash,
        'meta': meta or {}
    }
    save_users(users)
    return True


def verify_user(email: str, password: str):
    users = load_users()
    u = users.get(email)
    if not u:
        return False
    password_hash = u.get('password_hash', '')
    if not password_hash:
        return False
    return check_password_hash(password_hash, password)


def user_exists(email: str) -> bool:
    users = load_users()
    return email in users


def get_user(email: str):
    users = load_users()
    return users.get(email)
