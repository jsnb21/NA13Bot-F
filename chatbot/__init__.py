"""
Chatbot Module Package Initialization
========================================
This package initializes the chatbot module and exports the Flask blueprint
used for registering API routes in the main Flask application.

Module Components:
  - ai.py: Gemini AI integration and response generation
  - prompts.py: System prompt generation and building
  - routes.py: Flask API endpoints for chat functionality
  - training.py: Training data management and context retrieval
  - training_data/: Directory containing training files organized by restaurant_id

Exports:
  - chatbot_bp: Flask Blueprint for chatbot API routes (from routes.py)
"""

from chatbot.routes import chatbot_bp

__all__ = ['chatbot_bp']