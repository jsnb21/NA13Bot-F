from flask import Blueprint, request, jsonify, current_app
from chromadb import PersistentClient
import google.generativeai as genai
from services.gemini_engine import build_chat_session
from services.tools import check_availability, create_reservation
from models.settings import Setting
from models.restaurant import ApiKey

bp = Blueprint("client_api", __name__)


def resolve_restaurant_id() -> int | None:
    api_key = request.headers.get("X-API-Key")
    if api_key:
        record = ApiKey.query.filter_by(key=api_key, active=True).first()
        if record:
            return record.restaurant_id
    rid = request.headers.get("X-Restaurant-Id")
    return int(rid) if rid else None


def fetch_system_instruction(restaurant_id: int) -> str:
    setting = Setting.query.filter_by(restaurant_id=restaurant_id, key="system_instruction").first()
    if setting:
        return setting.value
    return "You are a restaurant assistant. Be concise, helpful, and stay within the tenant context."


def query_chroma(restaurant_id: int, query: str, top_k: int = 4):
    genai.configure(api_key=current_app.config.get("GEMINI_API_KEY", ""))
    client = PersistentClient(path=current_app.config["CHROMA_PATH"])
    collection = client.get_or_create_collection(current_app.config["CHROMA_COLLECTION"])
    q_emb = genai.embed_content(
        model="models/text-embedding-004",
        content=query,
        task_type="retrieval_query",
    )["embedding"]
    result = collection.query(
        query_embeddings=[q_emb],
        n_results=top_k,
        where={"restaurant_id": restaurant_id},
    )
    docs = result.get("documents", [[]])[0]
    metas = result.get("metadatas", [[]])[0]
    return [{"text": doc, "meta": meta} for doc, meta in zip(docs, metas)]


@bp.route("/v1/chat", methods=["POST"])
def chat():
    payload = request.get_json(force=True)
    user_query = payload.get("query", "").strip()
    if not user_query:
        return jsonify({"error": "query required"}), 400

    restaurant_id = resolve_restaurant_id()
    if not restaurant_id:
        return jsonify({"error": "tenant not resolved"}), 401

    context_chunks = query_chroma(restaurant_id, user_query)
    system_instruction = fetch_system_instruction(restaurant_id)

    chat_session = build_chat_session(
        api_key=current_app.config.get("GEMINI_API_KEY", ""),
        system_instruction=system_instruction,
        tools=[check_availability, create_reservation],
        model_name=current_app.config.get("GEMINI_MODEL", "gemini-1.5-pro"),
    )

    context_blob = "\n\n".join(
        [f"Section: {c['meta'].get('section')} | Text: {c['text']}" for c in context_chunks]
    )
    prompt = (
        f"User query: {user_query}\n"
        f"Relevant menu context (tenant-isolated):\n{context_blob}\n"
        "If availability or booking is needed, use the provided tools with restaurant_id."
    )

    response = chat_session.send_message(prompt)
    candidate = response.candidates[0]
    # Return text part if available
    content = getattr(candidate, "content", None)
    parts = content.parts if content and hasattr(content, "parts") else []
    text_parts = [p.text for p in parts if hasattr(p, "text")]
    return jsonify({
        "restaurant_id": restaurant_id,
        "response": "\n".join(text_parts) if text_parts else str(candidate),
    })
