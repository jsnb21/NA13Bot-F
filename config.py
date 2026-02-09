import os
from tools import load_config
import json
from pathlib import Path
import psycopg

CFG_PATH = Path(__file__).parent / 'config.json'

def load_config():
    if CFG_PATH.exists():
        return json.loads(CFG_PATH.read_text())
    return {}

def get_connection():
    # Prefer DATABASE_URL if set
    db_url = os.environ.get("DATABASE_URL")
    if db_url:
        return psycopg.connect(db_url)

    cfg = load_config().get("db", {})
    return psycopg.connect(
        host=cfg.get("host", "localhost"),
        port=cfg.get("port", 5432),
        dbname=cfg.get("name"),
        user=cfg.get("user"),
        password=cfg.get("password")
    )
    
def init_db():
    ddl = """
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    CREATE TABLE IF NOT EXISTS accounts (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(ddl)
            
    
def get_google_api_key():
    """Return the Google API key.

    Order of precedence:
    1. Environment variables `GOOGLE_API_KEY` or `google_api_key`
    2. Top-level keys in `config.json` (common variants)
    3. A wrapped `config` object inside `config.json` (some admin pages save under "config")
    Returns empty string if not found.
    """
    # 1) env vars (check common variants)
    for env_key in ('GOOGLE_API_KEY', 'google_api_key'):
        val = os.environ.get(env_key)
        if val:
            return val

    # 2) config file
    cfg = load_config() or {}

    # candidate keys to check in config.json
    candidates = ('google_api_key', 'GOOGLE_API_KEY', 'googleApiKey', 'api_key')

    # check top-level
    for k in candidates:
        if k in cfg and cfg.get(k):
            return cfg.get(k)

    # check wrapped 'config' object if present
    wrapped = cfg.get('config') if isinstance(cfg, dict) else None
    if isinstance(wrapped, dict):
        for k in candidates:
            if k in wrapped and wrapped.get(k):
                return wrapped.get(k)

    return ''