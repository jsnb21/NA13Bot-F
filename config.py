"""
Database Configuration & Initialization Module
===============================================
Handles all database setup, connection management, schema initialization, and
environment-based configuration. Supports PostgreSQL with customizable schemas
and multi-tenant data isolation.

Key Responsibilities:
  - Database connection pooling and management
    - Environment variable loading
  - Database schema initialization and migrations
  - Table creation for multi-tenant operation
  - Index creation for performance optimization
  - Google Gemini API key retrieval and validation
  - Schema support for custom database namespaces

Database Tables:
  1. accounts
     - User accounts with email, password hashing, and OTP metadata
     - Multi-tenant: restaurant_id for isolation
     - Stores user role and metadata (JSONB)
  
  2. brand_settings
     - Restaurant configuration and branding
     - Restaurant-specific settings (name, logo, colors, hours)
     - Menu text and system instructions
     - Currency and display preferences
  
  3. menu_items
     - Restaurant menu items with pricing and descriptions
     - Image storage (BYTEA with MIME type)
     - Category and status tracking
     - Per-restaurant isolation with indexed queries
  
  4. orders
     - Customer orders with items and totals
     - Order status tracking (pending, confirmed, completed)
     - Timestamp tracking for analytics
     - Multi-tenant isolation by restaurant_id

Indexes:
  - menu_items_restaurant_id_idx: Fast menu queries by restaurant
  - menu_items_restaurant_category_idx: Category filtering performance
  - menu_items_restaurant_status_idx: Status-based queries
  - orders_restaurant_id_idx: Fast order retrieval
  - orders_restaurant_status_idx: Order status filtering

Key Functions:
    - get_connection(): Get PostgreSQL connection with env var precedence
  - get_db_schema(): Get current database schema (custom or public)
  - init_db(): Initialize database schema and create all tables
  - get_google_api_key(): Retrieve Gemini API key with fallback logic

Environment Variables (Precedence Order):
  1. DATABASE_URL - Full PostgreSQL connection string
  2. DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD - Individual components
  3. DB_SCHEMA - Custom schema name (default: "public")
  4. GOOGLE_API_KEY or google_api_key - Gemini API key

Migration Support:
  - Automatic schema creation for non-public schemas
  - Incremental ALTER TABLE for backward compatibility
  - Column existence checks before adding
  - Constraint management (PRIMARY KEY changes)
  - Default value updates for existing data

Security & Isolation:
  - UUIDs for all primary keys (gen_random_uuid)
  - PostgreSQL extension: pgcrypto for UUID generation
  - Multi-tenant isolation via restaurant_id
  - Search path isolation per schema
  - JSONB storage for flexible metadata

Extensions:
  - pgcrypto: UUID generation and crypto functions
"""

import os
import json
import logging
import psycopg
from psycopg import sql
from pathlib import Path

try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None


logger = logging.getLogger(__name__)

def get_connection():
    """Get PostgreSQL connection from environment variables only.
    
    Credentials MUST be set in .env file or as environment variables.
    NO fallback to config.json for security reasons.
    
    Supports:
    1. DATABASE_URL - Full connection string
    2. DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD - Individual components
    """
    # Load .env if python-dotenv is available
    if load_dotenv is not None:
        load_dotenv()

    # Prefer DATABASE_URL if set
    db_url = os.environ.get("DATABASE_URL")
    if db_url:
        return psycopg.connect(db_url)

    # Individual connection parameters from env vars
    host = os.environ.get("DB_HOST")
    port = os.environ.get("DB_PORT")
    dbname = os.environ.get("DB_NAME")
    user = os.environ.get("DB_USER")
    password = os.environ.get("DB_PASSWORD")

    if not all([host, dbname, user, password]):
        missing = [k for k in ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'] 
                   if not os.environ.get(k)]
        raise ValueError(
            f"Missing required database credentials in environment variables: {', '.join(missing)}. "
            f"Set these in your .env file."
        )

    port = int(port) if port else 5432

    return psycopg.connect(
        host=host,
        port=port,
        dbname=dbname,
        user=user,
        password=password
    )

def get_db_schema():
    env_schema = os.environ.get("DB_SCHEMA")
    return env_schema or "public"
    
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
                      meta          JSONB,
                      restaurant_id UUID,
                      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
                    );
                    """
                ).format(sql.Identifier(schema))
            )
            
            # Add columns for existing tables
            cur.execute(
                sql.SQL("ALTER TABLE {}.accounts ADD COLUMN IF NOT EXISTS meta JSONB")
                .format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL("ALTER TABLE {}.accounts ADD COLUMN IF NOT EXISTS restaurant_id UUID")
                .format(sql.Identifier(schema))
            )

            # One-time cleanup: normalize email casing where it won't collide.
            cur.execute(
                sql.SQL(
                    """
                    UPDATE {}.accounts a
                    SET email = lower(a.email)
                    WHERE a.email <> lower(a.email)
                      AND NOT EXISTS (
                        SELECT 1 FROM {}.accounts b
                        WHERE lower(b.email) = lower(a.email)
                          AND b.id <> a.id
                      )
                    """
                ).format(sql.Identifier(schema), sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL(
                    """
                    SELECT lower(email), COUNT(*)
                    FROM {}.accounts
                    GROUP BY lower(email)
                    HAVING COUNT(*) > 1
                    """
                ).format(sql.Identifier(schema))
            )
            duplicates = cur.fetchall()
            if duplicates:
                logger.warning("Duplicate emails differ only by case: %s", duplicates)

            cur.execute(
                sql.SQL(
                    """
                    CREATE TABLE IF NOT EXISTS {}.brand_settings (
                                            restaurant_id     UUID PRIMARY KEY,
                      establishment_name TEXT,
                      logo_url          TEXT,
                      logo_data         BYTEA,
                      logo_mime         TEXT,
                      color_hex         TEXT,
                      main_color        TEXT,
                      sub_color         TEXT,
                      font_family       TEXT,
                      font_color        TEXT,
                      menu_text         TEXT,
                      currency_code     TEXT,
                      currency_symbol   TEXT,
                      chatbot_avatar    TEXT,
                      chatbot_avatar_data BYTEA,
                      chatbot_avatar_mime TEXT,
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
                                            image_data  BYTEA,
                                            image_mime  TEXT,
                                            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
                                            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
                                        );
                    """
                ).format(sql.Identifier(schema))
            )

            cur.execute(
                sql.SQL(
                    """
                    CREATE TABLE IF NOT EXISTS {}.orders (
                      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                      restaurant_id   UUID NOT NULL,
                                            order_number    BIGINT,
                      customer_name   TEXT,
                      customer_email  TEXT,
                      items           JSONB,
                      total_amount    NUMERIC(10,2),
                      status          TEXT DEFAULT 'pending',
                      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
                      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
                    );
                    """
                ).format(sql.Identifier(schema))
            )

            cur.execute(
                sql.SQL(
                    """
                    CREATE TABLE IF NOT EXISTS {}.training_files (
                      id               TEXT PRIMARY KEY,
                      restaurant_id    UUID NOT NULL,
                      original_name    TEXT,
                      stored_name      TEXT,
                      uploaded_at      TIMESTAMPTZ,
                      status           TEXT,
                      size_bytes       BIGINT,
                      ai_profile       JSONB,
                      ai_categories    JSONB,
                      ai_document_type TEXT,
                      created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
                      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
                    );
                    """
                ).format(sql.Identifier(schema))
            )

            cur.execute(
                sql.SQL(
                    """
                    CREATE TABLE IF NOT EXISTS {}.training_history (
                      id             TEXT PRIMARY KEY,
                      restaurant_id  UUID NOT NULL,
                      action         TEXT,
                      status         TEXT,
                      started_at     TIMESTAMPTZ,
                      ended_at       TIMESTAMPTZ,
                      duration_ms    INTEGER,
                      metadata       JSONB,
                      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
                    );
                    """
                ).format(sql.Identifier(schema))
            )

            # Device tokens for remember-this-device functionality
            cur.execute(
                sql.SQL(
                    """
                    CREATE TABLE IF NOT EXISTS {}.device_tokens (
                      id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                      email     TEXT NOT NULL,
                      token_hash TEXT NOT NULL,
                      expires_at TIMESTAMPTZ NOT NULL,
                      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                    );
                    """
                ).format(sql.Identifier(schema))
            )

            # Index for efficient device token lookup and cleanup
            cur.execute(
                sql.SQL(
                    "CREATE INDEX IF NOT EXISTS device_tokens_email_idx ON {}.device_tokens (email)"
                ).format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL(
                    "CREATE INDEX IF NOT EXISTS device_tokens_expires_at_idx ON {}.device_tokens (expires_at)"
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
                sql.SQL("ALTER TABLE {}.brand_settings ADD COLUMN IF NOT EXISTS currency_code TEXT")
                .format(sql.Identifier(schema))
            )
            
            # Add table_number column to orders table (migration from customer_email)
            cur.execute(
                sql.SQL("ALTER TABLE {}.orders ADD COLUMN IF NOT EXISTS table_number TEXT")
                .format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL("ALTER TABLE {}.orders ADD COLUMN IF NOT EXISTS order_number BIGINT")
                .format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL("ALTER TABLE {}.brand_settings ADD COLUMN IF NOT EXISTS currency_symbol TEXT")
                .format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL("ALTER TABLE {}.brand_settings ADD COLUMN IF NOT EXISTS logo_data BYTEA")
                .format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL("ALTER TABLE {}.brand_settings ADD COLUMN IF NOT EXISTS logo_mime TEXT")
                .format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL("ALTER TABLE {}.brand_settings ADD COLUMN IF NOT EXISTS chatbot_avatar_data BYTEA")
                .format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL("ALTER TABLE {}.brand_settings ADD COLUMN IF NOT EXISTS chatbot_avatar_mime TEXT")
                .format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL("ALTER TABLE {}.brand_settings ADD COLUMN IF NOT EXISTS main_foreground TEXT")
                .format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL("ALTER TABLE {}.brand_settings ADD COLUMN IF NOT EXISTS sub_foreground TEXT")
                .format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL("ALTER TABLE {}.brand_settings ADD COLUMN IF NOT EXISTS text_primary TEXT")
                .format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL("ALTER TABLE {}.brand_settings ADD COLUMN IF NOT EXISTS text_secondary TEXT")
                .format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL("ALTER TABLE {}.menu_items ADD COLUMN IF NOT EXISTS restaurant_id UUID")
                .format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL("ALTER TABLE {}.menu_items ADD COLUMN IF NOT EXISTS image_url TEXT")
                .format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL("ALTER TABLE {}.menu_items ADD COLUMN IF NOT EXISTS image_data BYTEA")
                .format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL("ALTER TABLE {}.menu_items ADD COLUMN IF NOT EXISTS image_mime TEXT")
                .format(sql.Identifier(schema))
            )

            cur.execute(
                sql.SQL(
                    "CREATE INDEX IF NOT EXISTS menu_items_restaurant_id_idx ON {}.menu_items (restaurant_id)"
                ).format(sql.Identifier(schema))
            )
            
            cur.execute(
                sql.SQL(
                    "CREATE INDEX IF NOT EXISTS orders_restaurant_id_idx ON {}.orders (restaurant_id)"
                ).format(sql.Identifier(schema))
            )

            cur.execute(
                sql.SQL(
                    "CREATE INDEX IF NOT EXISTS orders_restaurant_order_number_idx ON {}.orders (restaurant_id, order_number)"
                ).format(sql.Identifier(schema))
            )

            cur.execute(
                sql.SQL(
                    "CREATE INDEX IF NOT EXISTS training_files_restaurant_uploaded_idx ON {}.training_files (restaurant_id, uploaded_at DESC)"
                ).format(sql.Identifier(schema))
            )

            cur.execute(
                sql.SQL(
                    "CREATE INDEX IF NOT EXISTS training_files_restaurant_stored_name_idx ON {}.training_files (restaurant_id, stored_name)"
                ).format(sql.Identifier(schema))
            )

            cur.execute(
                sql.SQL(
                    "CREATE INDEX IF NOT EXISTS training_history_restaurant_started_idx ON {}.training_history (restaurant_id, started_at DESC)"
                ).format(sql.Identifier(schema))
            )
            
            # Additional performance indexes
            cur.execute(
                sql.SQL(
                    "CREATE INDEX IF NOT EXISTS menu_items_restaurant_category_idx ON {}.menu_items (restaurant_id, category)"
                ).format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL(
                    "CREATE INDEX IF NOT EXISTS menu_items_restaurant_status_idx ON {}.menu_items (restaurant_id, status)"
                ).format(sql.Identifier(schema))
            )
            cur.execute(
                sql.SQL(
                    "CREATE INDEX IF NOT EXISTS orders_restaurant_status_idx ON {}.orders (restaurant_id, status)"
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

            # Log current database and schema for troubleshooting.
            cur.execute("SELECT current_database(), current_schema();")
            db_name, current_schema = cur.fetchone() or (None, None)
            logger.info("DB context: database=%s, schema=%s", db_name, current_schema)
            
    
def get_google_api_key():
    """Return the Google API key.

    Order of precedence:
    1. Environment variables `GOOGLE_API_KEY` or `google_api_key`
    Returns empty string if not found.
    """
    if load_dotenv is not None:
        load_dotenv(override=True)

    # 1) env vars (check common variants)
    for env_key in ('GOOGLE_API_KEY', 'google_api_key'):
        val = os.environ.get(env_key)
        if val:
            return val.strip()

    return ''