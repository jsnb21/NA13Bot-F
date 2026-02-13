# NA13Bot-F - Multi-Tenant Restaurant AI Chatbot

A professional, multi-tenant restaurant AI agent built with **Flask** (backend) and **vanilla JavaScript** (frontend), powered by Google Gemini AI for intelligent, context-aware responses. The system supports AI training with custom restaurant data, order management, and secure multi-tenant isolation.

---

## 🎯 Project Overview

NA13Bot-F is a comprehensive AI-powered restaurant management solution that allows:

- **Restaurant Owners** to configure AI behavior, upload training data (menus, policies), and manage settings
- **Customers** to interact with a natural language chatbot for ordering, inquiries, and reservations
- **Administrators** to manage multiple restaurants in a single application with complete data isolation

The chatbot uses **Google Gemini 2.5 Flash** API to generate intelligent responses based on custom training context, ensuring accurate and contextually-relevant answers about menu items, pricing, and restaurant policies.

---

## ✨ Key Features

### For Restaurant Owners
- 🔐 **Role-Based Access Control** - Super admin, restaurant admin, and customer roles
- 📚 **AI Training Management** - Upload training files (TXT, PDF, DOCX, JSON, CSV) up to 50MB
- ⚙️ **Custom Prompts** - Configure system instructions for AI behavior
- 📊 **Dashboard** - View analytics and system status
- 🏪 **Multi-Tenant Support** - Manage multiple restaurants independently

### For Customers
- 💬 **AI-Powered Chat** - Natural language ordering and inquiries
- 🎯 **Context-Aware Responses** - AI trained on restaurant-specific data
- 📱 **Responsive Interface** - Works on desktop and mobile devices
- 🔐 **Secure Authentication** - OTP-based login system

### Technical Features
- 🗄️ **PostgreSQL Database** - Robust data persistence
- 🔄 **Real-Time Updates** - Flask-Turbo for seamless navigation
- 📤 **File Management** - Secure file uploads and storage
- 🛡️ **Secure Session Management** - Flask session-based security
- 📊 **Data Analytics** - Order tracking and user behavior analysis

---

## 🏗️ Architecture

### Tech Stack

**Backend:**
- Python 3.9+
- Flask 3.1+ - Web framework
- Flask-Turbo - Real-time page updates
- psycopg 3.1+ - PostgreSQL driver
- google.genai - Google Gemini AI API
- PyPDF - PDF file handling

**Frontend:**
- HTML5, CSS3, vanilla JavaScript
- Jinja2 templates
- Responsive design (Mobile-first)

**Database:**
- PostgreSQL
- (Development: SQLite alternative)

**AI:**
- Google Gemini 2.5 Flash API

### System Architecture

```
┌──────────────────────────────────────┐
│   Frontend (HTML/CSS/JavaScript)     │
│  - Admin Dashboard                   │
│  - Chatbot Interface                 │
│  - Settings Pages                    │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│   Flask Backend (app.py)             │
│  - Route handlers                    │
│  - Session management                │
│  - File uploads                      │
└──────────┬──────────────────────────┘
           │
      ┌────┴────┐
      ▼         ▼
┌─────────┐ ┌──────────────────┐
│tools.py │ │chatbot/          │
│(Utils)  │ │ ├─ ai.py         │
│         │ │ ├─ prompts.py    │
│         │ │ ├─ routes.py     │
│         │ │ ├─ training.py   │
│         │ │ └─ __init__.py   │
└────┬────┘ └────────┬─────────┘
     │               │
     └───────┬───────┘
             ▼
┌──────────────────────────────────────┐
│   PostgreSQL Database                │
│  - Users & Authentication            │
│  - Restaurant Configurations         │
│  - Orders & Reservations             │
│  - Training Data Manifests           │
└──────────────────────────────────────┘

     ┌────────────────────────────────┐
     │   Google Gemini API            │
     │  (AI Response Generation)      │
     └────────────────────────────────┘
```

---

## 📁 Project Structure

```
NA13Bot-F/
├── app.py                    # Main Flask application entry point
├── config.py                # Database & environment configuration
├── config.json              # Configuration file (credentials, DB settings)
├── requirements.txt         # Python dependencies
├── tools.py                 # Utility functions & helpers
├── users.json               # User data (legacy)
│
├── chatbot/                 # Chatbot module
│   ├── __init__.py
│   ├── ai.py               # Gemini API integration
│   ├── prompts.py          # System prompt generation
│   ├── routes.py           # Chatbot API endpoints
│   ├── training.py         # Training data context builder
│   └── training_data/      # Uploaded training files storage
│       ├── {restaurant_id}/
│       │   ├── manifest.json
│       │   └── {file_hashes}.txt
│
├── templates/              # HTML templates
│   ├── base/
│   │   ├── base.html       # Base template
│   │   └── auth_base.html  # Auth page base
│   ├── auth/
│   │   ├── login.html
│   │   ├── signup.html
│   │   └── otp_verify.html
│   ├── clients/
│   │   ├── dashboard.html  # Restaurant dashboard
│   │   ├── chatbot.html    # Chatbot interface
│   │   ├── ai-training.html# Training data manager
│   │   ├── settings.html   # Settings page
│   │   ├── menu.html
│   │   ├── orders.html
│   │   ├── customers.html
│   │   ├── reports.html
│   │   ├── admin-client.html
│   │   └── content/        # Nested templates
│   └── superadmin/
│       └── superadmin.html # Super admin panel
│
├── static/                 # Frontend assets
│   ├── css/
│   │   ├── base.css        # Base styles
│   │   ├── chatbot.css
│   │   ├── dashboard.css
│   │   ├── ai-training.css
│   │   ├── settings.css
│   │   ├── menu.css
│   │   └── reports.css
│   ├── js/
│   │   ├── base.js         # Core utilities
│   │   ├── chatbot.js
│   │   ├── ai-training.js
│   │   ├── settings.js
│   │   ├── reports.js
│   │   └── turbo-enhancements.js
│   ├── img/                # Images & assets
│   └── uploads/            # User-uploaded files (logos, etc.)
│
├── training_data/          # Training data storage by restaurant
│   └── {restaurant_id}/
│       ├── manifest.json
│       └── {file_hashes}.txt
│
├── docs/                   # Documentation
│   ├── README.md          # Original architecture docs
│   └── postgres.md        # Database schema docs
│
├── nai3botfvenv/           # Python virtual environment
│
└── __pycache__/            # Python cache
```

---

## 🚀 Getting Started

### Prerequisites

- **Python 3.9 or higher**
- **PostgreSQL 12+** (or SQLite for development)
- **Google Gemini API Key** - Get it from [Google AI Studio](https://aistudio.google.com/)
- **pip** (Python package manager)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/NA13Bot-F.git
   cd NA13Bot-F
   ```

2. **Create and activate virtual environment**
   ```bash
   # Windows (PowerShell)
   python -m venv env
   .\env\Scripts\Activate.ps1

   # macOS/Linux
   python3 -m venv env
   source env/bin/activate
   ```

3. **Install dependencies**
   ```bash
   pip install --upgrade pip setuptools wheel
   pip install -r requirements.txt
   ```

4. **Configure environment variables**

   Create a `.env` file in the root directory:
   ```env
   # Google Gemini API
   GEMINI_API_KEY=your_gemini_api_key_here

   # Database Configuration
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=na13bot
   DB_USER=postgres
   DB_PASSWORD=your_password

   # Flask Configuration
   FLASK_ENV=development
   FLASK_SECRET=change-me-in-production-key
   ```

   Alternatively, update `config.json`:
   ```json
   {
     "db": {
       "host": "localhost",
       "port": 5432,
       "name": "na13bot",
       "user": "postgres",
       "password": "your_password"
     }
   }
   ```

5. **Initialize the database**
   ```bash
   python -c "from config import init_db; init_db()"
   ```

6. **Run the application**
   ```bash
   python app.py
   ```

   The application will be available at `http://localhost:5000`

---

## 📝 Configuration

### Database Setup

The application uses PostgreSQL by default. To set up:

1. **Create the database:**
   ```sql
   CREATE DATABASE Restaurant_Chatbot;
   CREATE USER Restaurant_Chatbot WITH PASSWORD 'your_password';
   ALTER ROLE Restaurant_Chatbot SET client_encoding TO 'utf8';
   ALTER ROLE Restaurant_Chatbot SET default_transaction_isolation TO 'read committed';
   ALTER ROLE Restaurant_Chatbot SET default_transaction_deferrable TO on;
   GRANT ALL PRIVILEGES ON DATABASE Restaurant_Chatbot TO Restaurant_Chatbot;
   ```

2. **Update `config.json` with your credentials**

3. **Run initialization** - The application automatically creates tables on startup

### Google Gemini API

1. Visit [Google AI Studio](https://aistudio.google.com/)
2. Create a new API key
3. Add to `.env` or `config.json` as `GEMINI_API_KEY`

### Training Data

The system supports uploading training files for AI personalization:

- **Supported formats:** TXT, PDF, DOCX, JSON, CSV
- **Max file size:** 50MB per file
- **Storage location:** `training_data/{restaurant_id}/`
- **Automatic indexing:** Files are parsed and indexed in `manifest.json`

---

## 🔧 Core Modules

### `app.py` - Main Application
- Flask application factory
- Route registration (auth, admin, chatbot)
- File upload handlers
- Session management
- Database initialization

### `config.py` - Configuration Management
- Database connection setup
- Environment variable loading
- Database schema initialization
- Connection pooling

### `tools.py` - Utilities & Helpers
- User management functions
- Configuration saving/loading
- File validation
- Order processing

### `chatbot/ai.py` - Gemini Integration
- Google Gemini API client
- Response generation
- Error handling for API failures
- Token management

### `chatbot/prompts.py` - Prompt Engineering
- System prompt generation
- Context building from training data
- Prompt templating for different scenarios

### `chatbot/training.py` - Training Data Management
- Load and process training files
- Extract context from documents
- Build training context for AI

### `chatbot/routes.py` - Chatbot API
- API endpoints for chat requests
- Order extraction and processing
- Session handling

---

## 🔐 Authentication & Security

### User Roles
- **Super Admin** - Full system access, manage all restaurants
- **Restaurant Admin** - Manage their restaurant's settings and data
- **Customer** - Access to chatbot interface only

### Authentication Mechanism
- Email/password signup and login
- OTP (One-Time Password) verification for added security
- Flask session management
- Secure file uploads with validation

### File Security
- Filename sanitization using `secure_filename()`
- Extension whitelist validation
- Size limits (50MB for training files, configurable for media)
- Isolated storage per restaurant

---

## 📊 API Endpoints

### Authentication
- `POST /auth/signup` - Register new account
- `POST /auth/login` - Login with credentials
- `POST /auth/verify-otp` - Verify OTP
- `GET /logout` - Logout

### Admin Dashboard
- `GET /dashboard` - View restaurant dashboard
- `POST /upload-logo` - Upload restaurant logo
- `POST /upload-training-file` - Upload training data
- `GET /training` - Manage AI training

### Chatbot API
- `POST /api/chat` - Send message to chatbot
- `GET /api/chat/history` - Get conversation history

### Settings
- `GET /settings` - View/edit settings
- `POST /update-settings` - Save settings

---

## 🎓 Training the AI

1. **Access Admin Dashboard** - Login as restaurant admin
2. **Navigate to "AI Training"**
3. **Upload Training Files:**
   - Menu information
   - Restaurant policies
   - FAQ documents
   - Pricing details
   - Hours & availability
4. **Monitor Training:** Check manifest.json for uploaded files
5. **Test in Chatbot:** The AI automatically uses training data for responses

### Training Data Format Examples

**Menu (JSON):**
```json
{
  "menu": [
    {"name": "Grilled Salmon", "price": "$18.99", "description": "Fresh Atlantic salmon"},
    {"name": "Caesar Salad", "price": "$12.99", "description": "Crisp romaine with homemade dressing"}
  ]
}
```

**Restaurant Info (TXT):**
```
Restaurant Hours:
Monday - Friday: 11am - 10pm
Saturday - Sunday: 12pm - 11pm

Delivery Areas: Downtown, Midtown, Suburbs
Delivery Fee: $2.99 (free over $25)
```

---

## 🧪 Testing

To test the chatbot locally:

1. Start the application: `python app.py`
2. Open `http://localhost:5000`
3. Login with test credentials or create new account
4. On admin dashboard, add training data
5. In chatbot interface, ask questions about the restaurant

---

## 📦 Dependencies

Main dependencies (see `requirements.txt` for full list):

| Package | Purpose |
|---------|---------|
| Flask | Web framework |
| flask-turbo | Real-time page updates |
| psycopg | PostgreSQL driver |
| google.genai | Google Gemini API |
| pypdf | PDF handling |

---

## 🐛 Troubleshooting

### "API key not configured" error
- Ensure `GEMINI_API_KEY` is set in `.env` or `config.json`
- Verify the key is valid in [Google AI Studio](https://aistudio.google.com/)

### Database connection errors
- Verify PostgreSQL is running
- Check DB credentials in `config.json`
- Ensure database and user exist

### File upload fails
- Verify file format is in allowed list (TXT, PDF, DOCX, JSON, CSV)
- Check file size is under 50MB
- Ensure `training_data/` directory has write permissions

### Chatbot not responding
- Check `GEMINI_API_KEY` is configured
- Verify API quota hasn't been exceeded
- Check browser console for JavaScript errors
- Review server logs for Python errors

---

## 📚 Additional Documentation

- [Database Schema](docs/postgres.md) - Detailed schema documentation
- [Architecture Overview](docs/README.md) - Technical architecture details

---

## 👥 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/YourFeature`)
3. Commit changes (`git commit -m 'Add YourFeature'`)
4. Push to branch (`git push origin feature/YourFeature`)
5. Open a Pull Request

---

## 📄 License

This project is proprietary. All rights reserved.

---

## 🤝 Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Contact the development team

---

## 🔄 Version History

- **v1.0.0** (Current) - Initial release with multi-tenant support, AI training, and chatbot features

---

## 🙏 Acknowledgments

- Built with [Flask](https://flask.palletsprojects.com/)
- Powered by [Google Gemini API](https://ai.google.dev/)
- Database: [PostgreSQL](https://www.postgresql.org/)

---

**Last Updated:** February 2026  
**Status:** Active Development
