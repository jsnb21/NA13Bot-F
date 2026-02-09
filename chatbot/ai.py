import google.genai as genai
from config import get_google_api_key

class GeminiChatbot:
    def __init__(self):
        self.api_key = get_google_api_key()
        self.client = genai.Client(api_key=self.api_key) if self.api_key else None
        
    def get_response(self, user_message, system_prompt):
        """Generate AI response using Gemini"""
        if not self.client:
            return 'Google API key not configured.'
        try:
            generation_config = {
                'temperature': 0.7,
                'max_output_tokens': 500,
                'top_p': 0.9,
                'top_k': 40
            }

            response = self.client.models.generate_content(
                model='gemini-2.5-flash',
                contents=[
                    {"role": "system", "parts": [{"text": system_prompt}]},
                    {"role": "user", "parts": [{"text": user_message}]}
                ],
                generation_config=generation_config
            )
            return response.text
        except Exception as e:
            return f'Sorry, I encountered an error: {str(e)}'
        
    def list_models(self):
        """List available Gemini models."""
        if not self.client:
            raise Exception('No Google API key configured.')
        
        models = self.client.models.list()
        return [m.name for m in models]