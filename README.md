# NAI3Bot-H — Hospitality Track
## Restaurant AI Agent with Multi-Tenant Support

A professional multi-tenant restaurant AI agent built with Flask (backend) and React (frontend), using Google Gemini for RAG and agentic capabilities.

---

## System Architecture: Four-Component Stack

The application logic relies on **four distinct files/components** functioning in unison:

```
┌─────────────────────────┐
│   Admin Page (HTML)     │ ← THE INPUT LAYER
│  (RestoAdmin.jsx)       │    Handles data persistence, configuration,
│                         │    and asset uploads.
└────────────┬────────────┘
             │ 
             ↓
┌─────────────────────────┐
│      app.py             │ ← THE APPLICATION CORE
│  (backend/app.py)       │    Main Python entry point controlling
│                         │    routes and logic.
└────────┬────────────────┘
         │
         ↕
┌─────────────────────────┐
│     tools.py            │ ← THE UTILITY BELT
│ (backend/services/      │    Helper functions and scripts.
│  tools.py)              │    Includes Gemini function calls,
│                         │    menu ingestion, reservations.
└────────┬────────────────┘
         │
         ↓
┌─────────────────────────┐
│  Chatbot Page (HTML)    │ ← THE INTERFACE LAYER
│  (ClientChat.jsx)       │    Client-facing chat portal for
│                         │    communication and ordering.
└─────────────────────────┘
```

### Component Responsibilities

- **Admin Page** (`frontend/react-app/src/pages/RestoAdmin.jsx`):
  - Restaurant owners upload menus
  - Set system instructions for Gemini
  - Manage restaurant settings via `X-API-Key` header

- **app.py** (`backend/app.py`):
  - Flask factory and blueprint registration
  - Routes for super-admin, resto-admin, and client-api
  - Database initialization and migrations

- **tools.py** (`backend/services/tools.py`):
  - Gemini function calling: `check_availability()`, `create_reservation()`
  - Menu embeddings via ChromaDB
  - Tenant isolation and validation logic

- **Chatbot Page** (`frontend/react-app/src/pages/ClientChat.jsx`):
  - End-user chat interface
  - Queries backend via `/client-api/v1/chat`
  - Displays Gemini responses in real-time

---

## Environment Setup & Quick Start

### Prerequisites
- Python 3.9+
- Node.js 16+
- PostgreSQL (optional; SQLite used by default for local dev)
- Google Gemini API key

### Setup (Hospitality Track)

```powershell
# 1. Create project directory (or use existing resto-ai-agent)
mkdir NAI3Bot-H
cd NAI3Bot-H

# 2. Clone or navigate to repo (if not already done)
# git clone <repo> .
cd resto-ai-agent  # or project root

# 3. Backend setup
cd backend
python -m venv nai3botvenv
.\nai3botvenv\Scripts\Activate.ps1
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt

# 4. Frontend setup
cd ../frontend/react-app
npm install

# 5. Set environment variables
# Create .env in backend/ (example below)
# GEMINI_API_KEY=your_api_key_here
# DATABASE_URL=sqlite:///resto.db
# SECRET_KEY=change-me-in-production

# 6. Initialize database
# From backend/ with venv activated:
flask db init
flask db migrate
flask db upgrade

# 7. Run backend
python -m backend.app
# or: flask run

# 8. Run frontend (new terminal)
cd frontend/react-app
npm run dev
```

Visit:
- **Admin Panel**: http://localhost:5173 → tab "Resto Admin"
- **Chatbot**: http://localhost:5173 → tab "Client Chat"
- **API**: http://localhost:5000

---

## Project Structure

```
NAI3Bot-H (resto-ai-agent)/
├── backend/                      # FLASK APPLICATION CORE
│   ├── app.py                    # Main entry point
│   ├── config.py                 # Configuration
│   ├── extensions.py             # SQLAlchemy, Migrate init
│   ├── models/                   # Database models (Restaurant, Reservation, etc.)
│   ├── services/
│   │   ├── tools.py              # UTILITY BELT: Gemini tools, reservation logic
│   │   ├── gemini_engine.py      # Gemini session builder
│   │   └── menu_ingest.py        # Menu chunking & embedding
│   ├── blueprints/
│   │   ├── super_admin/          # Platform management (issue API keys)
│   │   ├── resto_admin/          # Restaurant config (menus, instructions)
│   │   └── client_api/           # End-user chat endpoint
│   ├── storage/
│   │   └── chroma/               # ChromaDB persistent directory
│   └── requirements.txt           # Python dependencies
│
├── frontend/                     # REACT SPA
│   ├── react-app/
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── SuperAdmin.jsx    # (optional) Create restaurants
│   │   │   │   ├── RestoAdmin.jsx    # INPUT LAYER: Admin page
│   │   │   │   └── ClientChat.jsx    # INTERFACE LAYER: Chatbot page
│   │   │   ├── components/
│   │   │   ├── api.js                # Axios client (points to Flask)
│   │   │   ├── App.jsx
│   │   │   ├── main.jsx
│   │   │   └── styles.css
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── vite.config.js            # Dev proxy to Flask
│   │   └── README.md
│   └── README.md
│
├── .git/
└── .gitattributes
```

---

## Running the Application

### Backend (Flask)

```powershell
cd backend
.\nai3botvenv\Scripts\Activate.ps1
python -m backend.app
# API available at http://localhost:5000
```

### Frontend (React + Vite)

```powershell
cd frontend/react-app
npm run dev
# Dev server at http://localhost:5173 with proxy to Flask
```

---

## Key Features

- **Multi-Tenant**: Strict `restaurant_id` isolation at database and Chroma levels
- **RAG + Agentic**: Gemini embeddings + function calling for reservations
- **API-First**: Flask REST endpoints consumed by React SPA
- **Four-Component Stack**: Clean separation of admin, core, utilities, and chat
- **Production-Ready**: Factory pattern, blueprints, SQLAlchemy ORM, Chroma persistence

---

## Development Notes

- **Gemini API Key**: Set `GEMINI_API_KEY` env var or in `.env` (backend/) before running
- **Database**: Defaults to SQLite (`resto.db`); set `DATABASE_URL` for Postgres
- **CORS**: Vite dev proxy handles `/super-admin`, `/resto-admin`, `/client-api` → Flask
- **Tenant Resolution**: React sends `X-API-Key` or `X-Restaurant-Id` header; Flask validates and isolates