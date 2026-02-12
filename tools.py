import json
from pathlib import Path
from psycopg import sql
from config import get_connection, get_db_schema
from datetime import datetime, timezone

CFG_PATH = Path(__file__).parent / 'config.json'

from werkzeug.security import generate_password_hash, check_password_hash

def load_config(restaurant_id: str = None):
    cfg = _load_json_config()

    try:
        brand = _fetch_brand_settings(restaurant_id)
        if brand:   
            cfg.update(brand)

        menu_items = _fetch_menu_items(restaurant_id)
        if menu_items is not None:
            cfg['menu_items'] = menu_items
    except Exception:
        # Fall back to JSON-only config if DB is unavailable.
        pass

    # Ensure currency_symbol has a proper default (not None)
    if not cfg.get('currency_symbol') or cfg.get('currency_symbol') == 'None':
        cfg['currency_symbol'] = '₱'
    
    return cfg

def save_config(data: dict, restaurant_id: str = None):
    base_cfg = _load_json_config()

    brand_data = _extract_brand_data(data)
    menu_items = data.get('menu_items') if isinstance(data, dict) else None

    # Keep non-brand keys in JSON config (API keys, DB config, etc.).
    json_update = {}
    if isinstance(data, dict):
        for key, value in data.items():
            if key in BRAND_FIELDS or key == 'menu_items':
                continue
            json_update[key] = value

    base_cfg.update(json_update)
    _save_json_config(base_cfg)

    if restaurant_id and (brand_data or menu_items is not None):
        try:
            if brand_data:
                _upsert_brand_settings(restaurant_id, brand_data)
            if menu_items is not None:
                _replace_menu_items(restaurant_id, menu_items)
        except Exception:
            # Still return True since JSON config was updated.
            return True

    return True


def _load_json_config():
    if CFG_PATH.exists():
        return json.loads(CFG_PATH.read_text())
    return {}


def _save_json_config(data: dict):
    CFG_PATH.write_text(json.dumps(data, indent=2, default=str))


BRAND_FIELDS = {
    'establishment_name',
    'logo_url',
    'color_hex',
    'main_color',
    'sub_color',
    'font_family',
    'font_color',
    'menu_text',
    'currency_code',
    'currency_symbol',
    'chatbot_avatar',
    'chatbot_avatar_uploaded_by',
    'chatbot_avatar_uploaded_at',
    'business_name',
    'business_email',
    'business_phone',
    'business_address',
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
    cfg = _load_json_config()
    rid = cfg.get('default_restaurant_id')
    return str(rid) if rid else None


def _fetch_brand_settings(restaurant_id: str = None):
    schema = get_db_schema()
    columns = [
        'restaurant_id',
        'establishment_name',
        'logo_url',
        'color_hex',
        'main_color',
        'sub_color',
        'font_family',
        'font_color',
        'menu_text',
        'currency_code',
        'currency_symbol',
        'chatbot_avatar',
        'chatbot_avatar_uploaded_by',
        'chatbot_avatar_uploaded_at',
        'business_name',
        'business_email',
        'business_phone',
        'business_address',
        'open_time',
        'close_time',
        'tax_rate',
        'image_urls'
    ]

    resolved_id = _resolve_restaurant_id(restaurant_id)

    with get_connection() as conn:
        with conn.cursor() as cur:
            if resolved_id:
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
            else:
                cur.execute(
                    sql.SQL(
                        "SELECT {} FROM {}.brand_settings ORDER BY updated_at DESC LIMIT 1"
                    ).format(
                        sql.SQL(', ').join(map(sql.Identifier, columns)),
                        sql.Identifier(schema)
                    )
                )
                row = cur.fetchone()

    if not row:
        return {}

    data = dict(zip(columns, row))
    if data.get('image_urls') is None:
        data['image_urls'] = []

    if not resolved_id and data.get('restaurant_id'):
        cfg = _load_json_config()
        if not cfg.get('default_restaurant_id'):
            cfg['default_restaurant_id'] = str(data['restaurant_id'])
            _save_json_config(cfg)

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
                    SELECT name, description, price, category, status
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
        items.append({
            'name': row[0],
            'description': row[1],
            'price': row[2],
            'category': row[3],
            'status': row[4]
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

    with get_connection() as conn:
        with conn.cursor() as cur:
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
                cur.execute(
                    sql.SQL(
                        """
                        INSERT INTO {}.menu_items (restaurant_id, name, description, price, category, status)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        """
                    ).format(sql.Identifier(schema)),
                    [
                        restaurant_id,
                        name,
                        (item.get('description') or '').strip(),
                        (item.get('price') or '').strip(),
                        (item.get('category') or '').strip(),
                        (item.get('status') or '').strip()
                    ]
                )


def add_user(email: str, password: str = None, meta: dict = None):
    """Add a new user to the database."""
    schema = get_db_schema()
    password_hash = ''
    if password:
        password_hash = generate_password_hash(password)
    
    restaurant_id = (meta or {}).get('restaurant_id') if meta else None
    meta_json = json.dumps(meta) if meta else None
    
    try:
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
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL(
                        "SELECT password_hash FROM {}.accounts WHERE email = %s"
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
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL(
                        "SELECT 1 FROM {}.accounts WHERE email = %s"
                    ).format(sql.Identifier(schema)),
                    [email]
                )
                return cur.fetchone() is not None
    except Exception:
        return False


def get_user(email: str):
    """Get user data from the database."""
    schema = get_db_schema()
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL(
                        "SELECT id, email, password_hash, meta, restaurant_id, created_at FROM {}.accounts WHERE email = %s"
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
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                # Get current meta
                cur.execute(
                    sql.SQL("SELECT meta FROM {}.accounts WHERE email = %s").format(sql.Identifier(schema)),
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
                            "UPDATE {}.accounts SET meta = %s::jsonb, restaurant_id = %s WHERE email = %s"
                        ).format(sql.Identifier(schema)),
                        [json.dumps(meta), restaurant_id, email]
                    )
                else:
                    cur.execute(
                        sql.SQL(
                            "UPDATE {}.accounts SET meta = %s::jsonb WHERE email = %s"
                        ).format(sql.Identifier(schema)),
                        [json.dumps(meta), email]
                    )
                return True
    except Exception:
        return False


def save_order(restaurant_id: str, order_data: dict):
    """Save a new order to the database."""
    schema = get_db_schema()
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL(
                        """INSERT INTO {}.orders (restaurant_id, customer_name, table_number, 
                           items, total_amount, status, created_at) 
                           VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id"""
                    ).format(sql.Identifier(schema)),
                    [
                        restaurant_id,
                        order_data.get('customer_name', ''),
                        order_data.get('table_number', ''),
                        json.dumps(order_data.get('items', [])),
                        float(order_data.get('total_amount', 0)),
                        order_data.get('status', 'pending'),
                        datetime.now(timezone.utc).isoformat()
                    ]
                )
                order_id = cur.fetchone()[0]
                return str(order_id)
    except Exception as e:
        print(f"Error saving order: {e}")
        return None


def get_orders(restaurant_id: str, limit: int = 50):
    """Retrieve orders for a restaurant."""
    schema = get_db_schema()
    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    sql.SQL(
                        """SELECT id, customer_name, table_number, items, total_amount, 
                           status, created_at FROM {}.orders 
                           WHERE restaurant_id = %s ORDER BY created_at DESC LIMIT %s"""
                    ).format(sql.Identifier(schema)),
                    [restaurant_id, limit]
                )
                rows = cur.fetchall()
                return [
                    {
                        'id': str(row[0]),
                        'customer_name': row[1],
                        'table_number': row[2],
                        'items': row[3] if isinstance(row[3], list) else json.loads(row[3] or '[]'),
                        'total_amount': float(row[4]),
                        'status': row[5],
                        'created_at': row[6].isoformat() if row[6] else None
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
