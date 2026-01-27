from typing import Iterable, List
import google.generativeai as genai
from chromadb import PersistentClient


def chunk_menu(raw_text: str) -> Iterable[dict]:
    section = "General"
    buffer: List[str] = []
    for line in raw_text.splitlines():
        if line.strip().endswith(":"):
            if buffer:
                yield {"section": section, "text": "\n".join(buffer)}
                buffer = []
            section = line.strip().rstrip(":") or "General"
        elif line.strip():
            buffer.append(line.strip())
    if buffer:
        yield {"section": section, "text": "\n".join(buffer)}


def ingest_menu(
    api_key: str,
    restaurant_id: int,
    menu_text: str,
    chroma_path: str,
    collection_name: str = "menu_chunks",
):
    genai.configure(api_key=api_key)
    client = PersistentClient(path=chroma_path)
    collection = client.get_or_create_collection(name=collection_name, metadata={"source": "menu"})

    documents: List[str] = []
    embeddings: List[List[float]] = []
    metadatas: List[dict] = []
    ids: List[str] = []

    for idx, chunk in enumerate(chunk_menu(menu_text)):
        emb = genai.embed_content(
            model="models/text-embedding-004",
            content=chunk["text"],
            task_type="retrieval_document",
            title=chunk["section"],
        )["embedding"]
        documents.append(chunk["text"])
        embeddings.append(emb)
        metadatas.append({"restaurant_id": restaurant_id, "section": chunk["section"]})
        ids.append(f"{restaurant_id}-{idx}")

    if documents:
        collection.upsert(documents=documents, embeddings=embeddings, metadatas=metadatas, ids=ids)
