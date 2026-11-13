import os
from pathlib import Path
from dotenv import load_dotenv

# Always backend/.env: a bare load_dotenv() guesses from the working directory under
# `uvicorn --reload` and would pick up PrepMind/.env (Docker settings only) instead.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")


class Settings:
    APP_ENV: str = os.getenv("APP_ENV", "development")
    BACKEND_PORT: int = int(os.getenv("BACKEND_PORT", "8000"))
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
    TIMEZONE: str = os.getenv("TIMEZONE", "Asia/Kolkata")

    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@localhost:5432/prepmind",
    )

    JWT_SECRET_KEY: str = os.getenv(
        "JWT_SECRET_KEY", "dev-only-prepmind-secret-key-change-me-in-production"
    )
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))

    SMTP_HOST: str = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "").replace(" ", "")
    EMAIL_FROM_NAME: str = os.getenv("EMAIL_FROM_NAME", "PrepMind AI")
    EMAIL_VERIFICATION_EXPIRE_HOURS: int = int(os.getenv("EMAIL_VERIFICATION_EXPIRE_HOURS", "24"))
    PASSWORD_RESET_EXPIRE_MINUTES: int = int(os.getenv("PASSWORD_RESET_EXPIRE_MINUTES", "30"))

    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")

    # Default chat model = LLM_PROVIDER:LLM_MODEL (provider: groq | gemini).
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "mock").lower()
    LLM_MODEL: str = os.getenv("LLM_MODEL", "gemini-3.8-flash")
    # Gemini API key: used for embeddings and for Gemini chat models.
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", "")
    GEMINI_CHAT_MODEL: str = os.getenv("GEMINI_CHAT_MODEL", "gemini-3.8-flash")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    # Output budget per chat reply. Without it Groq caps replies at 2-3k tokens (reasoning
    # included), which cut long JEE solutions off mid-equation.
    CHAT_MAX_OUTPUT_TOKENS: int = int(os.getenv("CHAT_MAX_OUTPUT_TOKENS", "8192"))

    # Exam/Daily 20 questions: one model writes them, a second solves them independently
    # and questions whose answers disagree are dropped. On Groq each model has its own
    # tokens-per-minute budget, so using two models also doubles throughput.
    QUESTION_GEN_MODEL: str = os.getenv("QUESTION_GEN_MODEL", "groq:openai/gpt-oss-120b")
    QUESTION_CHECK_MODEL: str = os.getenv("QUESTION_CHECK_MODEL", "groq:openai/gpt-oss-20b")
    # Small, fast model that names new chats from their first message.
    CHAT_TITLE_MODEL: str = os.getenv("CHAT_TITLE_MODEL", "groq:openai/gpt-oss-20b")

    EMBEDDING_PROVIDER: str = os.getenv("EMBEDDING_PROVIDER", "mock").lower()
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "gemini-embedding-001")
    EMBEDDING_DIMENSIONS: int = int(os.getenv("EMBEDDING_DIMENSIONS", "768"))

    # Retrieval tuning: how many chunks reach the LLM, and the minimum cosine
    # similarity for a chunk to count as relevant.
    RAG_TOP_K: int = int(os.getenv("RAG_TOP_K", "5"))
    RAG_MIN_SIMILARITY: float = float(os.getenv("RAG_MIN_SIMILARITY", "0.55"))


settings = Settings()