"""
Chat titles. A new chat is named from its first message: straight away with a tidy
shortened version of the message, then with a short AI-written title such as
"Hund's Rule and Nitrogen Configuration" once that is ready.
"""
import logging
import re
from typing import Optional

from backend.lib.config import settings
from backend.services.llm import content_text, default_model, get_chat_model, model_available

logger = logging.getLogger(__name__)

DEFAULT_TITLE = "New JEE Doubt Session"
MAX_TITLE_CHARS = 48

TITLE_PROMPT = (
    "Write a title for a student's study chat, based on their first message. "
    "3 to 6 words, Title Case, plain text: no quotes, LaTeX, emoji or final full stop. "
    "Name the topic, e.g. \"Hund's Rule and Nitrogen Configuration\" or "
    "\"Projectile Motion Range Formula\". Reply with the title only.\n\nMessage: "
)


def fallback_title(message: str) -> str:
    """The message shortened at a word boundary, e.g. "State Hund's rule and give the…"."""
    text = re.sub(r"\s+", " ", re.sub(r"[$*_`#>]", "", message)).strip()
    if not text:
        return DEFAULT_TITLE
    text = text[0].upper() + text[1:]
    if len(text) <= MAX_TITLE_CHARS:
        return text.rstrip(" .?!")
    cut = text[: MAX_TITLE_CHARS + 1].rsplit(" ", 1)[0].rstrip(" ,;:-")
    return f"{cut}…"


def _clean(raw: str) -> Optional[str]:
    title = raw.strip().splitlines()[0] if raw and raw.strip() else ""
    title = re.sub(r"^(title\s*:\s*)", "", title, flags=re.IGNORECASE)
    title = title.strip(" \"'`*#").rstrip(" .")
    if not 2 <= len(title.split()) <= 10 or len(title) > 70 or "$" in title or "\\" in title:
        return None
    return title


def generate_title(message: str) -> Optional[str]:
    """A short AI-written title, or None when no model is available or the reply is unusable."""
    model = settings.CHAT_TITLE_MODEL if model_available(settings.CHAT_TITLE_MODEL) else default_model()
    if not model_available(model):
        return None
    try:
        reply = get_chat_model(model, temperature=0.3).invoke(TITLE_PROMPT + message[:1000])
        return _clean(content_text(reply.content))
    except Exception:
        logger.warning("Chat title generation failed; keeping the shortened message.", exc_info=True)
        return None
