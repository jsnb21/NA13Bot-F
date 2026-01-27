import json
from pathlib import Path

CFG_PATH = Path(__file__).parent / 'config.json'

def load_config():
    if CFG_PATH.exists():
        return json.loads(CFG_PATH.read_text())
    return {}

def save_config(data: dict):
    CFG_PATH.write_text(json.dumps(data, indent=2))
    return True
