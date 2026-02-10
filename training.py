import json
import re
from pathlib import Path

TRAINING_DIR = Path(__file__).parent / 'training_data'
TRAINING_DIR.mkdir(parents=True, exist_ok=True)

TEXT_EXTENSIONS = {'.txt', '.json', '.csv'}


def get_training_dir(restaurant_id: str):
    safe_id = str(restaurant_id) if restaurant_id else 'default'
    path = TRAINING_DIR / safe_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_training_manifest_path(restaurant_id: str):
    return get_training_dir(restaurant_id) / 'manifest.json'


def load_training_manifest(restaurant_id: str):
    manifest_path = get_training_manifest_path(restaurant_id)
    if manifest_path.exists():
        try:
            return json.loads(manifest_path.read_text())
        except Exception:
            return []
    return []


def _read_text_file(path: Path):
    try:
        return path.read_text(encoding='utf-8', errors='ignore')
    except Exception:
        return ''


def _normalize_text(text: str):
    return re.sub(r"\s+", " ", text or "").strip()


def _chunk_text(text: str, chunk_size: int = 800, overlap: int = 100):
    if not text:
        return []
    chunks = []
    start = 0
    length = len(text)
    while start < length:
        end = min(length, start + chunk_size)
        chunks.append(text[start:end])
        if end == length:
            break
        start = max(0, end - overlap)
    return chunks


def _tokenize(query: str):
    tokens = re.findall(r"[a-z0-9]+", (query or "").lower())
    return [t for t in tokens if len(t) > 2]


def build_training_context(restaurant_id: str, query: str, max_chunks: int = 3):
    tokens = _tokenize(query)
    if not tokens:
        return ''

    entries = load_training_manifest(restaurant_id)
    training_dir = get_training_dir(restaurant_id)

    scored_chunks = []
    for entry in entries:
        stored_name = entry.get('stored_name')
        original_name = entry.get('original_name') or stored_name
        if not stored_name:
            continue
        file_path = training_dir / stored_name
        if not file_path.exists():
            continue
        if file_path.suffix.lower() not in TEXT_EXTENSIONS:
            continue
        raw_text = _read_text_file(file_path)
        normalized = _normalize_text(raw_text)
        if not normalized:
            continue
        for chunk in _chunk_text(normalized):
            score = sum(chunk.lower().count(t) for t in tokens)
            if score <= 0:
                continue
            scored_chunks.append((score, original_name, chunk))

    if not scored_chunks:
        return ''

    scored_chunks.sort(key=lambda item: item[0], reverse=True)
    picked = scored_chunks[:max_chunks]
    blocks = []
    for _, name, chunk in picked:
        blocks.append(f"File: {name}\n{chunk}")
    return "\n\n".join(blocks)
