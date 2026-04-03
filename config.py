# config.py — Central configuration for the Smart Micro-Learning Assistant
import os
from pathlib import Path

BASE_DIR = Path(__file__).parent

class Config:
    # Flask
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-production")
    DEBUG = os.environ.get("DEBUG", "false").lower() == "true"

    # Database
    DATABASE_PATH = os.path.join(BASE_DIR, "learning.db")

    # File uploads
    UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB
    ALLOWED_EXTENSIONS = {"pdf", "txt", "md"}

    # AI (aipipe.org — OpenAI-compatible endpoint)
    AIPIPE_BASE_URL = "https://aipipe.org/openai/v1"
    AIPIPE_MODEL   = "gpt-4o-mini"          # change to gpt-4o for higher quality
    AI_MAX_TOKENS  = 2048
    AI_TEMPERATURE = 0.7