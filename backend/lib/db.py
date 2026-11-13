from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, DeclarativeBase, Session
from typing import Generator
from backend.lib.config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def init_db() -> None:
    """Initialize the pgvector extension and create tables."""
    import backend.models  # noqa: F401 - registers all models on Base.metadata

    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        # Knowledge tables only hold data derived from the PDFs, so an outdated
        # schema (JSON embeddings) is dropped and rebuilt by the next ingestion.
        inspector = inspect(conn)
        if inspector.has_table("users"):
            # Columns added after the first release; create_all doesn't alter existing tables.
            conn.execute(text(
                "ALTER TABLE users "
                "ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE, "
                "ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ"
            ))
        if inspector.has_table("questions"):
            conn.execute(text(
                "ALTER TABLE questions "
                "ADD COLUMN IF NOT EXISTS question_type VARCHAR(20) NOT NULL DEFAULT 'mcq', "
                "ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'seed', "
                "ADD COLUMN IF NOT EXISTS source_ref VARCHAR(255), "
                "ADD COLUMN IF NOT EXISTS concept VARCHAR(160), "
                "ADD COLUMN IF NOT EXISTS generated_by VARCHAR(100), "
                "ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64) UNIQUE"
            ))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_questions_source ON questions (source)"))
        if inspector.has_table("exam_attempts"):
            conn.execute(text(
                "ALTER TABLE exam_attempts "
                "ADD COLUMN IF NOT EXISTS prep_ready INTEGER NOT NULL DEFAULT 0, "
                "ADD COLUMN IF NOT EXISTS prep_total INTEGER NOT NULL DEFAULT 0, "
                "ADD COLUMN IF NOT EXISTS prep_error TEXT, "
                "ADD COLUMN IF NOT EXISTS difficulty_level VARCHAR(20) NOT NULL DEFAULT 'foundation'"
            ))
        if inspector.has_table("exam_attempt_questions"):
            conn.execute(text(
                "ALTER TABLE exam_attempt_questions "
                "ADD COLUMN IF NOT EXISTS question_type VARCHAR(20) NOT NULL DEFAULT 'mcq', "
                "ADD COLUMN IF NOT EXISTS source_ref VARCHAR(255)"
            ))
        if inspector.has_table("messages"):
            conn.execute(text("ALTER TABLE messages ADD COLUMN IF NOT EXISTS model VARCHAR(100)"))
        if inspector.has_table("documents"):
            doc_cols = {c["name"] for c in inspector.get_columns("documents")}
            if "embedding_model" not in doc_cols:
                conn.execute(text("DROP TABLE IF EXISTS document_chunks, documents CASCADE"))
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()