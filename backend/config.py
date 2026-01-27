import os
from pathlib import Path


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "change-me")
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///resto.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-1.5-pro")

    BASE_DIR = Path(__file__).resolve().parent
    CHROMA_PATH = os.getenv(
        "CHROMA_PATH", str(BASE_DIR.joinpath("storage", "chroma"))
    )
    CHROMA_COLLECTION = os.getenv("CHROMA_COLLECTION", "menu_chunks")
