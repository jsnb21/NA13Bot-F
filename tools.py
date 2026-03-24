"""
Utility Functions & Database Operations Module
===============================================
Provides helper functions for user management, configuration operations,
database interactions, and order/payment processing. Acts as the bridge between
the Flask application and PostgreSQL database.

Key Responsibilities:
  - User authentication and account management
  - Configuration loading/saving with database sync
  - Brand settings (restaurant information, branding)
  - Menu items management and database operations
  - Order creation and tracking
  - Password hashing and verification
  - Database queries and data validation

User Management Functions:
  - add_user(email, password, restaurant_id): Create new account
  - verify_user(email, password): Authenticate user credentials
  - user_exists(email): Check if email exists
  - get_user(email): Fetch user account details
  - update_user_meta(email, meta): Update user metadata (JSONB)
  - is_user_registered(email): Check user registration status
  - get_current_user_restaurant(email): Get user's restaurant_id

Configuration Functions:
    - load_config(restaurant_id): Load restaurant config from DB
    - save_config(data, restaurant_id): Save config to DB
  - _extract_brand_data(data): Extract brand fields from config
  - _fetch_brand_settings(restaurant_id): Query database for branding
  - _upsert_brand_settings(restaurant_id, data): Create/update branding
  - _fetch_menu_items(restaurant_id): Query database for menu
  - _replace_menu_items(restaurant_id, items): Update menu items

Brand Settings Fields:
  - establishment_name: Restaurant name
  - logo_url: URL to restaurant logo
  - color_hex, main_color, sub_color: Color scheme
  - font_family, font_color: Typography
  - menu_text: Full menu content
  - currency_code, currency_symbol: Currency info (default: ₱)
  - chatbot_avatar: AI avatar image URL

  - open_time, close_time: Operating hours
  - tax_rate: Tax percentage
  - image_urls: Additional images (JSONB)

Order Management Functions:
  - save_order(restaurant_id, customer_name, items, total_amount): Create order
  - get_order(order_id): Fetch order details
  - get_orders(restaurant_id, limit): Get recent orders
  - update_order_status(order_id, status): Update order state

Payment Functions:
  - initiate_payment(order_id, amount): Start payment processing
  - verify_payment(reference): Check payment status
  - complete_order(order_id): Finalize completed order

Password Security:
  - Uses werkzeug.security for hashing (PBKDF2)
  - Salt is automatically generated and stored
  - check_password_hash() for secure verification

Configuration Priority:
    1. Environment variables (DB connection)
    2. PostgreSQL database (restaurant-specific branding, menu, orders)
    3. Fallback defaults (currency_symbol = ₱)

Data Types:
  - restaurant_id: UUID (unique restaurant identifier)
  - email: TEXT UNIQUE (user identifier)
  - password_hash: PBKDF2 with salt
  - Timestamps: TIMESTAMPTZ (timezone-aware)
  - Metadata: JSONB (flexible JSON storage)

Error Handling:
  - Graceful fallback if database is unavailable
  - JSON config used as fallback for missing DB data
  - Safe email validation
  - Password requirement enforcement

Dependencies:
  - werkzeug.security: Password hashing/verification
  - psycopg: PostgreSQL database driver
  - datetime: Timestamp management
  - json/pathlib: File operations
"""

import json
import re
import logging
import uuid
import shutil
import os
from pathlib import Path
from psycopg import sql
from config import get_connection, get_db_schema
from datetime import datetime, timezone

from werkzeug.security import generate_password_hash, check_password_hash


logger = logging.getLogger(__name__)


_CATEGORY_NAME_PREFIX_ALIASES = {
    'appetizers': ['appetizer', 'appetizers', 'starter', 'starters'],
    'main course': ['main course', 'main', 'entree', 'entrees'],
    'desserts': ['dessert', 'desserts'],
    'drinks beverages': ['drinks beverages', 'drinks', 'drink', 'beverages', 'beverage']
}


def normalize_menu_item_name(name: str, category: str = '') -> str:
    """Remove category-like prefixes from a menu item name."""
    cleaned_name = ' '.join(str(name or '').split())
    if not cleaned_name:
        return ''

    category_text = (category or '').strip().lower()
    normalized_category = re.sub(r'[^a-z0-9]+', ' ', category_text).strip()

    aliases = set()
    if category_text:
        aliases.add(category_text)
    if normalized_category:
        aliases.add(normalized_category)
        aliases.update(_CATEGORY_NAME_PREFIX_ALIASES.get(normalized_category, []))

    for prefix in sorted((alias for alias in aliases if alias), key=len, reverse=True):
        pattern = rf'^\s*{re.escape(prefix)}(?:\s*[:\-|]\s*|\s+)'
        candidate = re.sub(pattern, '', cleaned_name, count=1, flags=re.IGNORECASE).strip()
        if candidate and candidate != cleaned_name:
            return candidate

    return cleaned_name


def normalize_email(email: str) -> str:
    if not email:
        return ''
    return email.strip().lower()


def load_global_system_prompt():
    """Load the global system prompt for all restaurants.
    
    Should be set via GLOBAL_SYSTEM_PROMPT environment variable in .env file.
    Database storage support can be added later.
    """
    prompt = os.environ.get('GLOBAL_SYSTEM_PROMPT', '').strip()
    if prompt:
        return prompt
    return ''


def save_global_system_prompt(prompt: str):
    """Save global system prompt.
    
    This function is deprecated. System prompts should be managed via:
    1. .env file (GLOBAL_SYSTEM_PROMPT environment variable)
    2. Database storage (to be implemented)
    
    Config.json is no longer used for storing configuration.
    """
    logger.warning(
        "save_global_system_prompt() is deprecated. "
        "Use environment variable GLOBAL_SYSTEM_PROMPT in .env file instead."
    )
    return False

def load_config(restaurant_id: str = None):
    cfg = {}

    try:
        brand = _fetch_brand_settings(restaurant_id)
        if brand:   
            cfg.update(brand)

        menu_items = _fetch_menu_items(restaurant_id)
        if menu_items is not None:
            cfg['menu_items'] = menu_items
    except Exception:
        # Return empty config if the DB is unavailable.
        pass

    # Ensure currency_symbol has a proper default (not None)
    if not cfg.get('currency_symbol') or cfg.get('currency_symbol') == 'None':
        cfg['currency_symbol'] = '₱'
    
    return cfg

def save_config(data: dict, restaurant_id: str = None):
    brand_data = _extract_brand_data(data)
    menu_items = data.get('menu_items') if isinstance(data, dict) else None

    if restaurant_id and (brand_data or menu_items is not None):
        try:
            if brand_data:
                _upsert_brand_settings(restaurant_id, brand_data)
            if menu_items is not None:
                _replace_menu_items(restaurant_id, menu_items)
        except Exception:
            return False

    return True


BRAND_FIELDS = {
    'establishment_name',
    'logo_url',
    'logo_data',
    'logo_mime',
    'color_hex',
    'main_color',
    'main_foreground',
    'sub_color',
    'sub_foreground',
    'text_primary',
    'text_secondary',
    'font_family',
    'font_color',
    'menu_text',
    'currency_code',
    'currency_symbol',
    'chatbot_avatar',
    'chatbot_avatar_data',
    'chatbot_avatar_mime',
    'chatbot_avatar_uploaded_by',
    'chatbot_avatar_uploaded_at',
    'open_time',
    'close_time',
    'tax_rate',
    'image_urls'
}


def _extract_brand_data(data: dict):
    if not isinstance(data, dict):
        return {}
    return {key: data.get(key) for key in BRAND_FIELDS if key in data}


def _resolve_restaurant_id(restaurant_id: str = None):
    if restaurant_id:
        return str(restaurant_id)
    return None


def _fetch_brand_settings(restaurant_id: str = None):
    schema = get_db_schema()
    columns = [
        'restaurant_id',
        'establishment_name',
        'logo_url',
        'logo_data',
        'logo_mime',
        'color_hex',
        'main_color',
        'main_foreground',
        'sub_color',
        'sub_foreground',
        'text_primary',
        'text_secondary',
        'font_family',
        'font_color',
        'menu_text',
        'currency_code',
        'currency_symbol',
        'chatbot_avatar',
        'chatbot_avatar_data',
        'chatbot_avatar_mime',
        'chatbot_avatar_uploaded_by',
        'chatbot_avatar_uploaded_at',
        'open_time',
        'close_time',
        'tax_rate',
        'image_urls'
    ]

    resolved_id = _resolve_restaurant_id(restaurant_id)
    if not resolved_id:
        return {}

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "SELECT {} FROM {}.brand_settings WHERE restaurant_id = %s"
                ).format(
                    sql.SQL(', ').join(map(sql.Identifier, columns)),
                    sql.Identifier(schema)
                ),
                [resolved_id]
            )
            row = cur.fetchone()

    if not row:
        return {}

    data = dict(zip(columns, row))
    if data.get('image_urls') is None:
        data['image_urls'] = []

    return data


def _fetch_menu_items(restaurant_id: str = None):
    resolved_id = _resolve_restaurant_id(restaurant_id)
    if not resolved_id:
        return None

    schema = get_db_schema()
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    """
                    SELECT id, name, description, price, category, status, image_url, (image_data IS NOT NULL) AS has_image
                    FROM {}.menu_items
                    WHERE restaurant_id = %s
                    ORDER BY created_at ASC
                    """
                ).format(sql.Identifier(schema)),
                [resolved_id]
            )
            rows = cur.fetchall()

    items = []
    for row in rows or []:
        image_url = row[6]
        if not image_url and row[7]:  # has_image
            image_url = f"/menu/photo/{row[0]}"
        name = normalize_menu_item_name(row[1], row[4])
        items.append({
            'id': str(row[0]),
            'name': name,
            'description': row[2],
            'price': row[3],
            'category': row[4],
            'status': row[5],
            'image_url': image_url
        })
    return items


def _upsert_brand_settings(restaurant_id: str, data: dict):
    schema = get_db_schema()
    columns = ['restaurant_id'] + list(data.keys())
    if not columns:
        return

    values = []
    placeholders = []
    for col in columns:
        if col == 'restaurant_id':
            placeholders.append(sql.SQL("%s"))
            values.append(restaurant_id)
            continue
        if col == 'image_urls':
            placeholders.append(sql.SQL("%s::jsonb"))
            values.append(json.dumps(data.get(col)) if data.get(col) is not None else None)
        else:
            placeholders.append(sql.SQL("%s"))
            values.append(data.get(col))

    insert_cols = sql.SQL(', ').join(map(sql.Identifier, columns))
    insert_vals = sql.SQL(', ').join(placeholders)
    update_cols = sql.SQL(', ').join(
        sql.SQL("{} = EXCLUDED.{}").format(sql.Identifier(col), sql.Identifier(col))
        for col in columns
    )

    query = sql.SQL(
        """
        INSERT INTO {}.brand_settings ({})
        VALUES ({})
        ON CONFLICT (restaurant_id) DO UPDATE
        SET {}, updated_at = now()
        """
    ).format(sql.Identifier(schema), insert_cols, insert_vals, update_cols)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, values)


def _replace_menu_items(restaurant_id: str, menu_items):
    schema = get_db_schema()
    items = menu_items if isinstance(menu_items, list) else []
    if not restaurant_id:
        return

    def normalize_key(value: str) -> str:
        return re.sub(r'[^a-z0-9]+', '', (value or '').strip().lower())

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    """
                    SELECT id, name, image_url, image_data, image_mime
                    FROM {}.menu_items
                    WHERE restaurant_id = %s
                    """
                ).format(sql.Identifier(schema)),
                [restaurant_id]
            )
            preserved_rows = cur.fetchall()
            preserve_map = {}
            for row in preserved_rows or []:
                key = normalize_key(row[1])
                if key:
                    preserve_map[key] = {
                        'id': row[0],
                        'image_url': row[2],
                        'image_data': row[3],
                        'image_mime': row[4]
                    }

            cur.execute(
                sql.SQL("DELETE FROM {}.menu_items WHERE restaurant_id = %s").format(sql.Identifier(schema)),
                [restaurant_id]
            )

            for item in items:
                if not isinstance(item, dict):
                    continue
                name = (item.get('name') or '').strip()
                if not name:
                    continue

                key = normalize_key(name)
                preserved = preserve_map.get(key, {})
                item_id_raw = item.get('id') or preserved.get('id')
                try:
                    item_id = str(uuid.UUID(str(item_id_raw))) if item_id_raw else str(uuid.uuid4())
                except Exception:
                    item_id = str(uuid.uuid4())
                image_url = (item.get('image_url') or '').strip() or preserved.get('image_url')
                image_data = item.get('image_data') if item.get('image_data') is not None else preserved.get('image_data')
                image_mime = item.get('image_mime') if item.get('image_mime') is not None else preserved.get('image_mime')

                cur.execute(
                    sql.SQL(
                        """
                        INSERT INTO {}.menu_items (id, restaurant_id, name, description, price, category, status, image_url, image_data, image_mime)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """
                    ).format(sql.Identifier(schema)),
                    [
                        item_id,
                        restaurant_id,
                        name,
                        (item.get('description') or '').strip(),
                        (item.get('price') or '').strip(),
                        (item.get('category') or '').strip(),
                        (item.get('status') or '').strip(),
                        image_url,
                        image_data,
                        image_mime
                    ]
                )


def add_user(email: str, password: str = None, meta: dict = None):
    """Add a new user to the database."""
    schema = get_db_schema()
    email = normalize_email(email)
    password_hash = ''
    if password:
        password_hash = generate_password_hash(password)
    
    restaurant_id = (meta or {}).get('restaurant_id') if meta else None
    meta_json = json.dumps(meta) if meta else None
    
    try:
        if user_exists(email):
            return False
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL(
                        """INSERT INTO {}.accounts (email, password_hash, meta, restaurant_id)
                           VALUES (%s, %s, %s::jsonb, %s)
                           ON CONFLICT (email) DO NOTHING
                           RETURNING id"""
                    ).format(sql.Identifier(schema)),
                    [email, password_hash, meta_json, restaurant_id]
                )
                result = cur.fetchone()
                return result is not None
    except Exception:
        return False


def verify_user(email: str, password: str):
    """Verify user credentials against the database."""
    schema = get_db_schema()
    email = normalize_email(email)
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL(
                        "SELECT password_hash FROM {}.accounts WHERE lower(email) = %s"
                    ).format(sql.Identifier(schema)),
                    [email]
                )
                row = cur.fetchone()
                if not row or not row[0]:
                    return False
                return check_password_hash(row[0], password)
    except Exception:
        return False


def user_exists(email: str) -> bool:
    """Check if a user exists in the database."""
    schema = get_db_schema()
    email = normalize_email(email)
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL(
                        "SELECT 1 FROM {}.accounts WHERE lower(email) = %s"
                    ).format(sql.Identifier(schema)),
                    [email]
                )
                return cur.fetchone() is not None
    except Exception:
        return False


def get_user(email: str):
    """Get user data from the database."""
    schema = get_db_schema()
    email = normalize_email(email)
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL(
                        "SELECT id, email, password_hash, meta, restaurant_id, created_at FROM {}.accounts WHERE lower(email) = %s"
                    ).format(sql.Identifier(schema)),
                    [email]
                )
                row = cur.fetchone()
                if not row:
                    return None
                return {
                    'id': str(row[0]),
                    'email': row[1],
                    'password_hash': row[2],
                    'meta': row[3] or {},
                    'restaurant_id': str(row[4]) if row[4] else None,
                    'created_at': row[5]
                }
    except Exception:
        return None


def update_user_meta(email: str, updates: dict):
    """Update user metadata in the database."""
    schema = get_db_schema()
    email = normalize_email(email)
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Get current meta
                cur.execute(
                    sql.SQL("SELECT meta FROM {}.accounts WHERE lower(email) = %s").format(sql.Identifier(schema)),
                    [email]
                )
                row = cur.fetchone()
                if not row:
                    return False
                
                # Merge updates
                meta = row[0] or {}
                meta.update(updates or {})
                
                # Update restaurant_id if present in updates
                restaurant_id = updates.get('restaurant_id')
                
                if restaurant_id:
                    cur.execute(
                        sql.SQL(
                            "UPDATE {}.accounts SET meta = %s::jsonb, restaurant_id = %s WHERE lower(email) = %s"
                        ).format(sql.Identifier(schema)),
                        [json.dumps(meta), restaurant_id, email]
                    )
                else:
                    cur.execute(
                        sql.SQL(
                            "UPDATE {}.accounts SET meta = %s::jsonb WHERE lower(email) = %s"
                        ).format(sql.Identifier(schema)),
                        [json.dumps(meta), email]
                    )
                return True
    except Exception:
        return False


def get_next_order_number(restaurant_id: str):
    """Get the next order number for a restaurant."""
    schema = get_db_schema()
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL(
                        "SELECT COALESCE(MAX(order_number), 0) + 1 FROM {}.orders WHERE restaurant_id = %s"
                    ).format(sql.Identifier(schema)),
                    [restaurant_id]
                )
                row = cur.fetchone()
                return int(row[0]) if row and row[0] else 1
    except Exception:
        return 1


def save_order(restaurant_id: str, order_data: dict, order_number: int = None):
    """Save a new order to the database."""
    schema = get_db_schema()
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                if order_number:
                    next_number = int(order_number)
                else:
                    cur.execute(
                        sql.SQL("LOCK TABLE {}.orders IN EXCLUSIVE MODE").format(sql.Identifier(schema))
                    )
                    cur.execute(
                        sql.SQL(
                            "SELECT COALESCE(MAX(order_number), 0) + 1 FROM {}.orders WHERE restaurant_id = %s"
                        ).format(sql.Identifier(schema)),
                        [restaurant_id]
                    )
                    row = cur.fetchone()
                    next_number = int(row[0]) if row and row[0] else 1

                cur.execute(
                    sql.SQL(
                        """INSERT INTO {}.orders (restaurant_id, order_number, customer_name, table_number, 
                           items, total_amount, status, created_at) 
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING id"""
                    ).format(sql.Identifier(schema)),
                    [
                        restaurant_id,
                        next_number,
                        order_data.get('customer_name', ''),
                        order_data.get('table_number', ''),
                        json.dumps(order_data.get('items', [])),
                        float(order_data.get('total_amount', 0)),
                        order_data.get('status', 'pending'),
                        datetime.now(timezone.utc).isoformat()
                    ]
                )
                order_id = cur.fetchone()[0]
                return {
                    'id': str(order_id),
                    'order_number': next_number
                }
    except Exception as e:
        logger.exception("Error saving order")
        return None


def get_orders(restaurant_id: str, limit: int = 50):
    """Retrieve orders for a restaurant."""
    schema = get_db_schema()
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL(
                        """SELECT id, order_number, customer_name, table_number, items, total_amount, 
                               status, created_at FROM {}.orders 
                           WHERE restaurant_id = %s ORDER BY created_at DESC LIMIT %s"""
                    ).format(sql.Identifier(schema)),
                    [restaurant_id, limit]
                )
                rows = cur.fetchall()
                return [
                    {
                        'id': str(row[0]),
                        'order_number': row[1],
                        'customer_name': row[2],
                        'table_number': row[3],
                        'items': row[4] if isinstance(row[4], list) else json.loads(row[4] or '[]'),
                        'total_amount': float(row[5]),
                        'status': row[6],
                        'created_at': row[7].isoformat() if row[7] else None
                    }
                    for row in rows
                ]
    except Exception:
        return []


def update_order_status(order_id: str, status: str):
    """Update order status."""
    schema = get_db_schema()
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL(
                        "UPDATE {}.orders SET status = %s WHERE id = %s"
                    ).format(sql.Identifier(schema)),
                    [status, order_id]
                )
                return True
    except Exception:
        return False


def get_order_by_customer(restaurant_id: str, customer_name: str = None, order_number: int = None):
    """Get order(s) by customer name or order number."""
    schema = get_db_schema()
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                if order_number:
                    # Look up by order number
                    cur.execute(
                        sql.SQL(
                            """SELECT id, order_number, customer_name, table_number, items, total_amount, 
                                   status, created_at FROM {}.orders 
                               WHERE restaurant_id = %s AND order_number = %s 
                               ORDER BY created_at DESC LIMIT 1"""
                        ).format(sql.Identifier(schema)),
                        [restaurant_id, order_number]
                    )
                elif customer_name:
                    # Look up by customer name (most recent)
                    cur.execute(
                        sql.SQL(
                            """SELECT id, order_number, customer_name, table_number, items, total_amount, 
                                   status, created_at FROM {}.orders 
                               WHERE restaurant_id = %s AND LOWER(customer_name) = LOWER(%s) 
                               ORDER BY created_at DESC LIMIT 1"""
                        ).format(sql.Identifier(schema)),
                        [restaurant_id, customer_name]
                    )
                else:
                    return None
                
                row = cur.fetchone()
                if not row:
                    return None
                    
                return {
                    'id': str(row[0]),
                    'order_number': row[1],
                    'customer_name': row[2],
                    'table_number': row[3],
                    'items': row[4] if isinstance(row[4], list) else json.loads(row[4] or '[]'),
                    'total_amount': float(row[5]),
                    'status': row[6],
                    'created_at': row[7].isoformat() if row[7] else None
                }
    except Exception as e:
        logger.exception("Error fetching order")
        return None


def get_all_restaurants():
    """Get list of all restaurants with their basic info."""
    schema = get_db_schema()
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL(
                        """
                        SELECT DISTINCT 
                            b.restaurant_id,
                            b.establishment_name,
                            b.business_email,
                            b.updated_at,
                            b.currency_symbol,
                            (SELECT COUNT(*) FROM {}.menu_items m WHERE m.restaurant_id = b.restaurant_id) as menu_count,
                            (SELECT COUNT(*) FROM {}.orders o WHERE o.restaurant_id = b.restaurant_id) as order_count
                        FROM {}.brand_settings b
                        WHERE b.restaurant_id IS NOT NULL
                        ORDER BY b.updated_at DESC
                        """
                    ).format(
                        sql.Identifier(schema),
                        sql.Identifier(schema),
                        sql.Identifier(schema)
                    )
                )
                rows = cur.fetchall()
                return [
                    {
                        'restaurant_id': str(row[0]) if row[0] else None,
                        'establishment_name': row[1] or 'Unnamed Restaurant',
                        'business_email': row[2] or '',
                        'updated_at': row[3].isoformat() if row[3] else None,
                        'currency_symbol': row[4] or '₱',
                        'menu_count': int(row[5]) if row[5] else 0,
                        'order_count': int(row[6]) if row[6] else 0,
                        'status': 'Active' if row[5] or row[6] else 'Inactive'
                    }
                    for row in rows
                ]
    except Exception as e:
        logger.exception("Error fetching restaurants")
        return []


def get_platform_stats():
    """Get platform-wide statistics."""
    schema = get_db_schema()
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Total restaurants
                cur.execute(
                    sql.SQL("SELECT COUNT(DISTINCT restaurant_id) FROM {}.brand_settings WHERE restaurant_id IS NOT NULL")
                    .format(sql.Identifier(schema))
                )
                total_restaurants = cur.fetchone()[0] or 0

                # Total orders
                cur.execute(
                    sql.SQL("SELECT COUNT(*) FROM {}.orders").format(sql.Identifier(schema))
                )
                total_orders = cur.fetchone()[0] or 0

                # Total menu items
                cur.execute(
                    sql.SQL("SELECT COUNT(*) FROM {}.menu_items").format(sql.Identifier(schema))
                )
                total_menu_items = cur.fetchone()[0] or 0

                # Active restaurants (with recent orders in last 30 days)
                cur.execute(
                    sql.SQL(
                        """SELECT COUNT(DISTINCT restaurant_id) FROM {}.orders 
                           WHERE created_at >= NOW() - INTERVAL '30 days'"""
                    ).format(sql.Identifier(schema))
                )
                active_restaurants = cur.fetchone()[0] or 0

                return {
                    'total_restaurants': int(total_restaurants),
                    'total_orders': int(total_orders),
                    'total_menu_items': int(total_menu_items),
                    'active_restaurants': int(active_restaurants)
                }
    except Exception as e:
        logger.exception("Error fetching platform stats")
        return {
            'total_restaurants': 0,
            'total_orders': 0,
            'total_menu_items': 0,
            'active_restaurants': 0
        }


def get_restaurant_details(restaurant_id: str, days: int = 14):
        """Get detailed tenant info for superadmin view, including traffic timeline."""
        schema = get_db_schema()
        rid = (restaurant_id or '').strip()
        if not rid:
                return None

        safe_days = max(7, min(int(days or 14), 90))

        try:
                with get_connection() as conn:
                        with conn.cursor() as cur:
                                cur.execute(
                                        sql.SQL(
                                                """
                                                SELECT
                                                    b.establishment_name,
                                                    b.business_email,
                                                    b.updated_at,
                                                    (
                                                        SELECT a.email
                                                        FROM {}.accounts a
                                                        WHERE a.restaurant_id = %s
                                                        ORDER BY a.created_at ASC
                                                        LIMIT 1
                                                    ) AS owner_email,
                                                    (
                                                        SELECT COUNT(*)
                                                        FROM {}.orders o
                                                        WHERE o.restaurant_id = %s
                                                    ) AS total_traffic,
                                                    GREATEST(
                                                        COALESCE(b.updated_at, to_timestamp(0)),
                                                        COALESCE((SELECT MAX(m.updated_at) FROM {}.menu_items m WHERE m.restaurant_id = %s), to_timestamp(0)),
                                                        COALESCE((SELECT MAX(o.updated_at) FROM {}.orders o WHERE o.restaurant_id = %s), to_timestamp(0)),
                                                        COALESCE((SELECT MAX(tf.updated_at) FROM {}.training_files tf WHERE tf.restaurant_id = %s), to_timestamp(0))
                                                    ) AS last_modified
                                                FROM {}.brand_settings b
                                                WHERE b.restaurant_id = %s
                                                LIMIT 1
                                                """
                                        ).format(
                                                sql.Identifier(schema),
                                                sql.Identifier(schema),
                                                sql.Identifier(schema),
                                                sql.Identifier(schema),
                                                sql.Identifier(schema),
                                                sql.Identifier(schema),
                                        ),
                                        [rid, rid, rid, rid, rid, rid]
                                )
                                row = cur.fetchone()

                                if not row:
                                        return None

                                establishment_name = row[0] or 'Unnamed Restaurant'
                                business_email = row[1] or ''
                                owner_email = row[3] or ''
                                total_traffic = int(row[4] or 0)
                                last_modified = row[5]

                                cur.execute(
                                        sql.SQL(
                                                """
                                                WITH day_series AS (
                                                    SELECT generate_series(
                                                        current_date - (%s::int - 1),
                                                        current_date,
                                                        interval '1 day'
                                                    )::date AS day
                                                )
                                                SELECT
                                                    ds.day,
                                                    COALESCE(COUNT(o.id), 0) AS traffic
                                                FROM day_series ds
                                                LEFT JOIN {}.orders o
                                                    ON o.restaurant_id = %s
                                                 AND o.created_at::date = ds.day
                                                GROUP BY ds.day
                                                ORDER BY ds.day ASC
                                                """
                                        ).format(sql.Identifier(schema)),
                                        [safe_days, rid]
                                )
                                traffic_rows = cur.fetchall() or []

                traffic_series = [
                        {
                                'date': day.isoformat() if day else '',
                                'value': int(value or 0)
                        }
                        for day, value in traffic_rows
                ]

                email_used = owner_email or business_email

                return {
                        'restaurant_id': rid,
                        'establishment_name': establishment_name,
                        'email_used': email_used,
                        'last_modified': last_modified.isoformat() if last_modified else None,
                        'total_traffic': total_traffic,
                        'traffic_series': traffic_series,
                }
        except Exception:
                logger.exception("Error fetching restaurant details")
                return None


def delete_tenant_data(restaurant_id: str):
    """Delete a tenant and all tenant-scoped data from database and local storage."""
    schema = get_db_schema()
    rid = (restaurant_id or '').strip()
    if not rid:
        return {'success': False, 'message': 'Missing restaurant_id.'}

    deleted_counts = {
        'orders': 0,
        'menu_items': 0,
        'training_history': 0,
        'training_files': 0,
        'brand_settings': 0,
        'accounts': 0,
        'device_tokens': 0,
    }

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL(
                        """
                        SELECT DISTINCT lower(email)
                        FROM {}.accounts
                        WHERE restaurant_id::text = %s
                           OR COALESCE(meta->>'restaurant_id', '') = %s
                        """
                    ).format(sql.Identifier(schema)),
                    [rid, rid]
                )
                tenant_emails = [row[0] for row in (cur.fetchall() or []) if row and row[0]]

                for table_name in ['orders', 'menu_items', 'training_history', 'training_files', 'brand_settings']:
                    cur.execute(
                        sql.SQL("DELETE FROM {}.{} WHERE restaurant_id::text = %s").format(
                            sql.Identifier(schema),
                            sql.Identifier(table_name),
                        ),
                        [rid],
                    )
                    deleted_counts[table_name] = cur.rowcount or 0

                cur.execute(
                    sql.SQL(
                        """
                        DELETE FROM {}.accounts
                        WHERE restaurant_id::text = %s
                           OR COALESCE(meta->>'restaurant_id', '') = %s
                        """
                    ).format(sql.Identifier(schema)),
                    [rid, rid],
                )
                deleted_counts['accounts'] = cur.rowcount or 0

                if tenant_emails:
                    cur.execute(
                        sql.SQL("DELETE FROM {}.device_tokens WHERE lower(email) = ANY(%s)").format(
                            sql.Identifier(schema)
                        ),
                        [tenant_emails],
                    )
                    deleted_counts['device_tokens'] = cur.rowcount or 0

        project_root = Path(__file__).resolve().parent
        file_paths = [
            project_root / 'training_data' / rid,
            project_root / 'uploads' / rid,
            project_root / 'static' / 'uploads' / rid,
        ]

        removed_paths = []
        for target in file_paths:
            try:
                if target.is_dir():
                    shutil.rmtree(target)
                    removed_paths.append(str(target))
                elif target.is_file():
                    target.unlink(missing_ok=True)
                    removed_paths.append(str(target))
            except Exception:
                logger.exception("Failed cleaning tenant file path: %s", target)

        return {
            'success': True,
            'restaurant_id': rid,
            'deleted_counts': deleted_counts,
            'removed_paths': removed_paths,
        }
    except Exception:
        logger.exception("Error deleting tenant: %s", rid)
        return {'success': False, 'message': 'Failed to delete tenant data.'}
