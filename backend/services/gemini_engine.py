from typing import Any, Callable, Dict, List, Optional
import google.generativeai as genai


def to_gemini_tool(fn: Callable) -> Dict[str, Any]:
    # Prefer explicit schema attached to the function
    schema = getattr(fn, "__gemini_schema__", None)
    if not schema:
        schema = {
            "type": "OBJECT",
            "properties": {name: {"type": "STRING"} for name in fn.__code__.co_varnames},
        }
    return {
        "function_declarations": [
            {
                "name": fn.__name__,
                "description": (fn.__doc__ or "").strip(),
                "parameters": schema,
            }
        ]
    }


def build_chat_session(
    api_key: str,
    system_instruction: str,
    tools: List[Callable],
    model_name: str = "gemini-1.5-pro",
    safety_settings: Optional[List[Dict[str, Any]]] = None,
):
    genai.configure(api_key=api_key)
    tool_defs = [to_gemini_tool(fn) for fn in tools]
    model = genai.GenerativeModel(
        model_name,
        system_instruction=system_instruction,
        tools=tool_defs,
        safety_settings=safety_settings or [],
    )
    return model.start_chat()
