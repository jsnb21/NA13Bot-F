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


def add_user(email: str, password: str, meta: dict = None):
    users = load_users()
    if email in users:
        return False
    users[email] = {
        'password_hash': generate_password_hash(password),
        'meta': meta or {}
    }
    save_users(users)
    return True


def verify_user(email: str, password: str):
    users = load_users()
    u = users.get(email)
    if not u:
        return False
    return check_password_hash(u.get('password_hash',''), password)
