"""
Training Data Management Module
================================
Handles loading, processing, and retrieval of custom training data for
restaurant-specific AI knowledge. Implements semantic search based on
token matching for context-aware responses.

Core Components:
  - Training data storage and manifest management
  - File handling for TXT, JSON, CSV formats
  - Text chunking with overlap for context preservation
  - Token-based semantic search
  - Context retrieval for chatbot prompts

Key Functions:
  - get_training_dir(): Get restaurant-specific training directory
  - get_training_manifest_path(): Access training manifest
  - load_training_manifest(): Load file metadata from manifest.json
  - build_training_context(): Retrieve relevant training chunks for queries
  - _read_text_file(): Safe file reading with error handling
  - _normalize_text(): Clean and normalize text data
  - _chunk_text(): Split text into overlapping chunks for context
  - _tokenize(): Extract searchable tokens from queries

Features:
  - Multi-restaurant isolation (restaurant_id based)
  - Semantic search scoring based on token frequency
  - Configurable chunk size (default 800 chars) with overlap (100 chars)
  - Manifest-based file tracking with original names
  - Safe file operations with UTF-8 handling
  - Query-based chunk scoring and ranking
  - Configurable result limiting (top N chunks)

Data Structure:
  training_data/
  ├── {restaurant_id}/
  │   ├── manifest.json (file metadata)
  │   ├── {uuid}.txt (training content)
  │   ├── {uuid}.json
  │   └── {uuid}.csv

Manifest Entry Format:
  {
    "id": "file_uuid",
    "original_name": "filename.txt",
    "stored_name": "hash.txt",
    "uploaded_at": "ISO timestamp",
    "size_bytes": 1024
  }
"""

import io
import json
import re
from pathlib import Path

try:
    from pypdf import PdfReader
except Exception:
    PdfReader = None

try:
    from docx import Document
except Exception:
    Document = None

TRAINING_DIR = Path(__file__).resolve().parent.parent / 'training_data'
TRAINING_DIR.mkdir(parents=True, exist_ok=True)

TEXT_EXTENSIONS = {'.txt', '.json', '.csv', '.pdf', '.docx'}


def get_training_dir(restaurant_id: str):
    if restaurant_id:
        safe_id = str(restaurant_id)
    else:
        safe_id = 'default'
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


def _read_pdf_text(path: Path):
    if not PdfReader:
        return ''
    try:
        data = path.read_bytes()
        reader = PdfReader(io.BytesIO(data))
    except Exception:
        return ''
    parts = []
    for page in reader.pages:
        try:
            text = page.extract_text() or ''
        except Exception:
            text = ''
        if text:
            parts.append(text)
    return '\n'.join(parts)


def _read_docx_text(path: Path):
    if not Document:
        return ''
    try:
        doc = Document(str(path))
    except Exception:
        return ''
    parts = []
    for paragraph in doc.paragraphs:
        text = (paragraph.text or '').strip()
        if text:
            parts.append(text)
    for table in doc.tables:
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells if cell.text]
            if cells:
                parts.append(' | '.join(cells))
    return '\n'.join(parts)


def _read_training_text(path: Path):
    suffix = path.suffix.lower()
    if suffix == '.pdf':
        return _read_pdf_text(path)
    if suffix == '.docx':
        return _read_docx_text(path)
    return _read_text_file(path)


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
        raw_text = _read_training_text(file_path)
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
