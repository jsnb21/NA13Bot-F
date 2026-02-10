import os
import json
from pathlib import Path
import psycopg
from psycopg import sql

try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None

CFG_PATH = Path(__file__).parent / 'config.json'

def load_config():
    if CFG_PATH.exists():
        return json.loads(CFG_PATH.read_text())
    return {}

def get_connection():
    # Load .env if python-dotenv is available
    if load_dotenv is not None:
        load_dotenv()

    # Prefer DATABASE_URL if set
    db_url = os.environ.get("DATABASE_URL")
    if db_url:
        return psycopg.connect(db_url)

    cfg = load_config().get("db", {})
    # Env vars take precedence over config.json
    env_host = os.environ.get("DB_HOST")
    env_port = os.environ.get("DB_PORT")
    env_name = os.environ.get("DB_NAME")
    env_user = os.environ.get("DB_USER")
    env_password = os.environ.get("DB_PASSWORD")

    host = env_host or cfg.get("host", "localhost")
    port = int(env_port) if env_port else cfg.get("port", 5432)
    name = env_name or cfg.get("name")
    user = env_user or cfg.get("user")
    password = env_password or cfg.get("password")

    return psycopg.connect(
        host=host,
        port=port,
        dbname=name,
        user=user,
        password=password
    )

def get_db_schema():
    cfg = load_config().get("db", {})
    env_schema = os.environ.get("DB_SCHEMA")
    return env_schema or cfg.get("schema") or "public"
    
def init_db():
    schema = get_db_schema()
    with get_connection() as conn:
        with conn.cursor() as cur:
            if schema != "public":
                cur.execute(
                    sql.SQL("CREATE SCHEMA IF NOT EXISTS {}")
                    .format(sql.Identifier(schema))
                )
                cur.execute(
                    sql.SQL("SET search_path TO {}")
                    .format(sql.Identifier(schema))
                )

            cur.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto";')
            cur.execute(
                sql.SQL(
                    """
                    CREATE TABLE IF NOT EXISTS {}.accounts (
                      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                      email         TEXT UNIQUE NOT NULL,
                      password_hash TEXT NOT NULL,
                      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
                    );
                    """
                ).format(sql.Identifier(schema))
            )

            cur.execute(
                sql.SQL(
                    """
                    CREATE TABLE IF NOT EXISTS {}.brand_settings (
                                            restaurant_id     UUID PRIMARY KEY,
                      establishment_name TEXT,
                      logo_url          TEXT,
                      color_hex         TEXT,
                      main_color        TEXT,
                      sub_color         TEXT,
                      font_family       TEXT,
                      font_color        TEXT,
                      menu_text         TEXT,
                      chatbot_avatar    TEXT,
                                            chatbot_avatar_uploaded_by TEXT,
                                            chatbot_avatar_uploaded_at TIMESTAMPTZ,
                      business_name     TEXT,
                      business_email    TEXT,
                      business_phone    TEXT,
                      business_address  TEXT,
                      open_time         TEXT,
                      close_time        TEXT,
                      tax_rate          TEXT,
                      image_urls        JSONB,
                      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
                    );
                    """
                ).format(sql.Identifier(schema))
            )

            cur.execute(
                sql.SQL(
                    """
                    CREATE TABLE IF NOT EXISTS {}.menu_items (
                      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                      restaurant_id UUID,
                      name        TEXT NOT NULL,
                      description TEXT,
                      price       TEXT,
                      category    TEXT,
                      status      TEXT,
                      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
                    );
                    """
                ).format(sql.Identifier(schema))
            )

            # Legacy schema migration: allow multi-tenant rows and add missing columns.
            cur.execute(
                sql.SQL("ALTER TABLE {}.brand_settings ADD COLUMN IF NOT EXISTS restaurant_id UUID")
                .format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL("ALTER TABLE {}.brand_settings ADD COLUMN IF NOT EXISTS chatbot_avatar_uploaded_by TEXT")
                .format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL("ALTER TABLE {}.brand_settings ADD COLUMN IF NOT EXISTS chatbot_avatar_uploaded_at TIMESTAMPTZ")
                .format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL("ALTER TABLE {}.menu_items ADD COLUMN IF NOT EXISTS restaurant_id UUID")
                .format(sql.Identifier(schema))
            )

            cur.execute(
                sql.SQL(
                    "CREATE INDEX IF NOT EXISTS menu_items_restaurant_id_idx ON {}.menu_items (restaurant_id)"
                ).format(sql.Identifier(schema))
            )

            cur.execute(
                sql.SQL("UPDATE {}.brand_settings SET restaurant_id = gen_random_uuid() WHERE restaurant_id IS NULL")
                .format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL(
                    "UPDATE {}.menu_items SET restaurant_id = (SELECT restaurant_id FROM {}.brand_settings LIMIT 1) WHERE restaurant_id IS NULL"
                ).format(sql.Identifier(schema), sql.Identifier(schema))
            )

            cur.execute(
                sql.SQL("ALTER TABLE {}.brand_settings DROP CONSTRAINT IF EXISTS brand_settings_id_check")
                .format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL("ALTER TABLE {}.brand_settings DROP CONSTRAINT IF EXISTS brand_settings_pkey")
                .format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL("ALTER TABLE {}.brand_settings DROP COLUMN IF EXISTS id")
                .format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL("ALTER TABLE {}.brand_settings ADD CONSTRAINT brand_settings_pkey PRIMARY KEY (restaurant_id)")
                .format(sql.Identifier(schema))
            )
            
    
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