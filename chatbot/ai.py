"""
Google Gemini AI Integration Module
====================================
Provides the GeminiChatbot class for integrating with Google's Gemini AI API.
Handles API communication, response generation, and error management.

Main Class:
  - GeminiChatbot: Wrapper for Google Gemini API client

Key Functions:
  - get_response(): Generates AI responses using Gemini with conversation history
  - list_models(): Lists available Gemini models

Features:
  - Conversation history support for multi-turn dialogue
  - Configurable temperature, token limits, and sampling parameters
  - Comprehensive error handling:
    * Rate limiting (429 errors)
    * Authentication issues (401 errors)
    * API quota exhaustion
  - Graceful fallback messages for API failures

Configuration:
    - Uses GEMINI_API_KEY from environment
  - Model: gemini-2.5-flash
  - Max tokens: 500, Temperature: 0.7
"""

import google.genai as genai
from config import get_google_api_key

class GeminiChatbot:
    def __init__(self):
        self.api_key = get_google_api_key()
        self.client = genai.Client(api_key=self.api_key) if self.api_key else None
        
    def get_response(self, user_message, system_prompt, conversation_history=None):
        """Generate AI response using Gemini"""
        if not self.client:
            return 'Google API key not configured.'
        try:
            # Build conversation contents
            contents = []
            
            # Add conversation history if provided
            if conversation_history:
                for msg in conversation_history:
                    role = 'user' if msg.get('role') == 'user' else 'model'
                    content = msg.get('content', '')
                    if content:
                        contents.append({"role": role, "parts": [{"text": content}]})
            
            # Add current user message
            contents.append({"role": "user", "parts": [{"text": user_message}]})
            
            response = self.client.models.generate_content(
                model='gemini-2.5-flash',
                contents=contents,
                config=genai.types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=0.7,
                    max_output_tokens=500,
                    top_p=0.9,
                    top_k=40
                )
            )
            return response.text
        except Exception as e:
            error_str = str(e)
            # Check for rate limit / quota errors
            if '429' in error_str or 'RESOURCE_EXHAUSTED' in error_str or 'quota' in error_str.lower():
                return 'I apologize, but I\'ve reached my usage limit for now. Please try again in a minute or contact support if this persists.'
            # Check for authentication errors
            elif '401' in error_str or 'UNAUTHENTICATED' in error_str or 'API key' in error_str:
                return 'There\'s an issue with the API configuration. Please contact support.'
            # Generic error
            else:
                return f'Sorry, I encountered an error. Please try again or contact support if this continues.'
        
    def list_models(self):
        """List available Gemini models."""
        if not self.client:
            raise Exception('No Google API key configured.')
        
        models = self.client.models.list()
        return [m.name for m in models]