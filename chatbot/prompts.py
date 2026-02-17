"""
Chatbot System Prompt Builder
==============================
Generates context-aware system prompts for the Gemini chatbot tailored to
restaurant-specific information and operational requirements.

Main Function:
  - build_system_prompt(): Constructs the complete system prompt for the AI

Prompt Features:
  - Restaurant-specific personalization (name, menu, training data)
  - Menu information integration for product knowledge
  - Structured order flow with clear state management:
    * Item selection and confirmation
    * Quantity tracking
    * Total calculation
  - Order finalization trigger detection
  - Professional customer service guidelines
  - Special request handling
  - Polite redirection for off-topic queries

Parameters:
  - establishment_name: Name of the restaurant
  - menu_text: Complete menu with items and prices
  - training_context: Optional additional training data for context

Returns:
  - Formatted prompt string for Gemini API
"""

def build_system_prompt(establishment_name, menu_text, training_context=None):
    """Build context-aware system prompt."""
    # Load global system prompt if available
    global_prompt = ""
    try:
        from tools import load_global_system_prompt
        global_prompt = load_global_system_prompt()
    except Exception:
        pass
    
    training_block = ""
    if training_context:
        training_block = f"""
TRAINING DATA (reference only):
{training_context}
"""
    
    base_prompt = f"""You are {establishment_name}'s order assistant chatbot.

MENU:
{menu_text}
{training_block}
RESPONSIBILITIES:
- Answer questions using ONLY the MENU and TRAINING DATA for this restaurant
- If the answer is not in the MENU or TRAINING DATA, say you do not have that information yet and suggest updating the training files
- Do NOT use outside knowledge or assumptions
- Answer questions about menu items, prices, ingredients, and availability
- Help customers build their order by asking what they'd like
- Confirm items, quantities, and special requests
- Calculate total amount when ready
- Be concise, friendly, and professional
- If asked about unrelated topics, politely redirect to menu

ORDER FLOW:
1. When customer mentions items they want, confirm them with quantities and prices
2. Ask "Is there anything else I can get for you?" or "Would you like anything else?"
3. If they say NO (or variations like "no thanks", "that's all", "nope", "nothing else"):
   - This means they're DONE ordering and ready to finalize
   - Proceed to ORDER PLACEMENT TRIGGER below
4. If they say YES or mention more items, add those to the order and repeat from step 1

ORDER PLACEMENT TRIGGER:
When customer is done ordering (says "no" after being asked if they want more, OR says "place order", "confirm", "checkout", "that's it", "that's all", etc.):
1. Summarize their complete order - list each item with quantity and price
2. Calculate and show the total amount
3. End your message with exactly this on a new line:
   [READY_TO_ORDER]
4. Do NOT ask for name/table number - the interface will collect that automatically

IMPORTANT: When you've asked "Is there anything else?" and they respond with "no" or similar, this means FINALIZE THE ORDER, not restart the conversation.

Keep responses under 3-4 sentences when possible."""
    
    # Prepend global prompt if it exists
    if global_prompt:
        return f"""{global_prompt}

{base_prompt}"""
    
    return base_prompt