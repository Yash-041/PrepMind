"""
Chat model registry. Answers can come from Groq or Gemini; embeddings always use
Gemini (see embeddings.py), so switching chat models never invalidates stored vectors.

Model ids are "<provider>:<model>", e.g. "groq:openai/gpt-oss-120b". The default is
LLM_PROVIDER + LLM_MODEL from .env; a request may pick any other available model.
"""
import re
from typing import List, Optional

from backend.lib.config import settings

# Label shown in /api/chats/models; order is the order listed.
CHAT_MODELS = {
    "groq:openai/gpt-oss-120b": "GPT-OSS 120B (Groq)",
    "groq:openai/gpt-oss-20b": "GPT-OSS 20B (Groq)",
    "groq:qwen/qwen3.8-27b": "Qwen 3.8 27B (Groq)",
    f"gemini:{settings.GEMINI_CHAT_MODEL}": f"{settings.GEMINI_CHAT_MODEL} (Google)",
}


def default_model() -> str:
    return f"{settings.LLM_PROVIDER}:{settings.LLM_MODEL}"


def _provider_key(provider: str) -> str:
    return {"groq": settings.GROQ_API_KEY, "gemini": settings.LLM_API_KEY}.get(provider, "")


def model_available(model_id: Optional[str] = None) -> bool:
    provider, _, name = (model_id or default_model()).partition(":")
    return bool(name) and bool(_provider_key(provider))


def list_models() -> List[dict]:
    ids = list(CHAT_MODELS)
    if default_model() not in CHAT_MODELS:
        ids.insert(0, default_model())
    return [
        {
            "id": model_id,
            "label": CHAT_MODELS.get(model_id, model_id),
            "available": model_available(model_id),
            "is_default": model_id == default_model(),
        }
        for model_id in ids
    ]


def get_chat_model(model_id: Optional[str] = None, temperature: float = 0.2):
    provider, _, name = (model_id or default_model()).partition(":")
    if provider == "groq":
        from langchain_groq import ChatGroq

        return ChatGroq(
            model=name,
            api_key=settings.GROQ_API_KEY,
            temperature=temperature,
            max_tokens=settings.CHAT_MAX_OUTPUT_TOKENS,
            # Keep the model's chain of thought out of the answer text.
            reasoning_format="parsed",
            max_retries=2,
            timeout=60,
        )
    if provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=name,
            google_api_key=settings.LLM_API_KEY,
            temperature=temperature,
            max_output_tokens=settings.CHAT_MAX_OUTPUT_TOKENS,
            max_retries=2,
            timeout=60,
        )
    raise ValueError(f"Unknown chat model provider: {provider!r}")


def content_text(content) -> str:
    """
    Normalise a chat response: Gemini may return content parts, some models emit <think>
    blocks, and GPT-OSS writes \\( \\) / \\[ \\] maths where the UI expects $ / $$.
    """
    if not isinstance(content, str):
        content = "".join(
            part.get("text", "") if isinstance(part, dict) else str(part) for part in content
        )
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL)
    content = re.sub(r"\\\[(.+?)\\\]", r"$$\1$$", content, flags=re.DOTALL)
    content = re.sub(r"\\\((.+?)\\\)", r"$\1$", content, flags=re.DOTALL)
    return content.strip()
