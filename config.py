import os
from tools import load_config

def get_google_api_key():
    key = os.environ.get('GOOGLE_API_KEY', '')
    if key:
        return key
    cfg = load_config()
    return cfg.get('GOOGLE_API_KEY', '')