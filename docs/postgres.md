# PostgreSQL Connection Guide

This document explains how the Flask app connects to PostgreSQL, how configuration is resolved, and how schema initialization works.

## Where Connections Are Defined

All database connection logic lives in [config.py](../config.py):

- `get_connection()` builds a connection using environment variables or `config.json`.
- `get_db_schema()` resolves the schema name for multi-tenant tables.
- `init_db()` creates and migrates required tables on startup.

`init_db()` is called during app startup in [app.py](../app.py).

## Connection Resolution Order

`get_connection()` resolves settings in this order:

1. `DATABASE_URL` environment variable (full connection string)
2. Individual environment variables (if `DATABASE_URL` is not set):
   - `DB_HOST`
   - `DB_PORT`
   - `DB_NAME`
   - `DB_USER`
   - `DB_PASSWORD`
3. `config.json` under the `db` object:

   ```json
   {
     "db": {
       "host": "localhost",
       "port": 5432,
       "name": "resto",
       "user": "postgres",
       "password": "password",
       "schema": "public"
     }
   }
   ```

If `python-dotenv` is installed, `.env` is loaded before environment variables are read. That means `DATABASE_URL` and the `DB_*` values can be defined in `.env`.

## Schema Selection

`get_db_schema()` resolves the schema in this priority order:

1. `DB_SCHEMA` environment variable
2. `config.json` `db.schema`
3. Default: `public`

If the schema is not `public`, `init_db()` will create it and set the `search_path` for the session before creating tables.

## Tables Created on Startup

`init_db()` will ensure these tables exist:

- `accounts`
- `brand_settings`
- `menu_items`

It also:

- Enables the `pgcrypto` extension (used for UUID generation).
- Adds missing columns for multi-tenant support.
- Creates `menu_items_restaurant_id_idx` on `menu_items(restaurant_id)`.
- Normalizes older rows that might be missing `restaurant_id`.

## Example Connection Strings

### Local Postgres

```
DATABASE_URL=postgresql://user:password@localhost:5432/resto
```

### Individual Environment Variables

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=resto
DB_USER=postgres
DB_PASSWORD=password
DB_SCHEMA=public
```

## Troubleshooting

### Connection Refused

- Ensure Postgres is running.
- Confirm `DB_HOST` and `DB_PORT` are correct.
- Check firewall rules or local Postgres config.

### Authentication Failed

- Verify `DB_USER` and `DB_PASSWORD`.
- Confirm the user has access to `DB_NAME`.

### Schema Missing

- `init_db()` should create the schema automatically if `DB_SCHEMA` is set.
- If permissions block schema creation, grant `CREATE` on the database to the user.

### Read/Write Errors

- Ensure the DB user has `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on the schema tables.

## Quick Sanity Check

If you want to verify the connection outside the app:

```
psql "postgresql://user:password@localhost:5432/resto"
```

Then run:

```
\dn
\dt
```

You should see the configured schema and the tables above.
