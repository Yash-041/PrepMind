"""
Embedding provider for the knowledge base.
Gemini (`gemini-embedding-001`) embeds documents and queries with separate task
types, which improves retrieval quality. Without an API key a deterministic
keyword-hash vector of the same dimension is used so the app still runs offline.
"""
import hashlib
import math
import re
import time
from typing import List

from backend.lib.config import settings

MOCK_MODEL_NAME = "mock-hash"
_BATCH_SIZE = 50
_MAX_RETRIES = 10


def active_embedding_model() -> str:
    """Name stored on each Document so stale vectors are re-embedded after a model change."""
    if settings.EMBEDDING_PROVIDER == "gemini" and settings.LLM_API_KEY:
        return f"gemini:{settings.EMBEDDING_MODEL}:{settings.EMBEDDING_DIMENSIONS}"
    return f"{MOCK_MODEL_NAME}:{settings.EMBEDDING_DIMENSIONS}"


def _gemini_embedder(task_type: str):
    from langchain_google_genai import GoogleGenerativeAIEmbeddings

    return GoogleGenerativeAIEmbeddings(
        model=settings.EMBEDDING_MODEL,
        google_api_key=settings.LLM_API_KEY,
        task_type=task_type,
        output_dimensionality=settings.EMBEDDING_DIMENSIONS,
    )


def _normalize(vec: List[float]) -> List[float]:
    # gemini-embedding-001 only returns unit vectors at its full 3072 dimensions.
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def _with_retry(fn):
    """Back off on rate limits (Gemini free tier) instead of failing a whole book."""
    for attempt in range(_MAX_RETRIES):
        try:
            return fn()
        except Exception as exc:
            msg = str(exc).lower()
            retryable = "429" in msg or "resource" in msg or "quota" in msg or "503" in msg
            # A daily quota won't recover by waiting a few minutes; fail fast.
            if not retryable or "perday" in msg or attempt == _MAX_RETRIES - 1:
                raise
            # Per-minute quota errors say e.g. "Please retry in 41.2s".
            hint = re.search(r"retry in ([\d.]+)s", msg)
            delay = float(hint.group(1)) + 1 if hint else min(60, 2 ** attempt * 5)
            time.sleep(delay)


def _mock_embedding(text: str) -> List[float]:
    dim = settings.EMBEDDING_DIMENSIONS
    vec = [0.0] * dim
    tokens = [t.lower().strip(".,?:;()[]{}") for t in text.split() if len(t) > 2]
    for tok in tokens:
        h = int(hashlib.md5(tok.encode("utf-8")).hexdigest(), 16)
        vec[h % dim] += 1.0
    if not tokens:
        vec[0] = 1.0  # pgvector cosine distance is undefined for zero vectors
    return _normalize(vec)


def embed_documents(texts: List[str]) -> List[List[float]]:
    if not texts:
        return []
    if not active_embedding_model().startswith("gemini:"):
        return [_mock_embedding(t) for t in texts]

    embedder = _gemini_embedder("RETRIEVAL_DOCUMENT")
    vectors: List[List[float]] = []
    for start in range(0, len(texts), _BATCH_SIZE):
        batch = texts[start : start + _BATCH_SIZE]
        vectors.extend(_with_retry(lambda: embedder.embed_documents(batch)))
    return [_normalize(v) for v in vectors]


def embed_query(text: str) -> List[float]:
    if not active_embedding_model().startswith("gemini:"):
        return _mock_embedding(text)
    embedder = _gemini_embedder("RETRIEVAL_QUERY")
    return _normalize(_with_retry(lambda: embedder.embed_query(text)))
