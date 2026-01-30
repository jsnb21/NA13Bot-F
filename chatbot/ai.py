import google.generativeai as genai
from config import get_google_api_key

class GeminiChatbot:
    def __init__(self):
        self.api_key = get_google_api_key()
        if self.api_key:
            genai.configure(api_key=self.api_key)
        
    def get_response(self, user_message, system_prompt):
        """Generate AI response using Gemini"""
        if not self.api_key:
            return 'Google API key not configured.'
        try:
            model = genai.GenerativeModel('models/gemini-2.5-flash')
            response = model.generate_content(f"{system_prompt}\n\n Customer: {user_message} \n Assistant:")
            return response.text
        except Exception as e:
            return f'Sorry, I Encountered an error: {str(e)}'
        
    def list_models(self):
        """List available Gemini models."""
        if not self.api_key:
            raise Exception('No Google API key configured.')
        
        genai.configure(api_key=self.api_key)
        models = genai.list_models()
        return [m.name for m in models if 'generateContent' in m.supported_generation_methods]