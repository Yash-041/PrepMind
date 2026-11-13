import json
import logging
from concurrent.futures import Future, ThreadPoolExecutor
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.lib.db import SessionLocal, get_db
from backend.lib.dates import utc_now
from backend.lib.security import get_current_user
from backend.models.user import User
from backend.models.chat import Conversation, Message
from backend.schemas.api_schemas import (
    ChatCreateRequest,
    ChatUpdateRequest,
    MessageCreateRequest,
)
from backend.services.chat_titles import DEFAULT_TITLE, fallback_title, generate_title
from backend.services.llm import default_model, list_models, model_available
from backend.services.rag_graph import run_rag_tutor, stream_rag_tutor

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/api/chats", tags=["AI Tutor Chatbot"])
# Titles are written alongside the answer, so naming a chat adds no waiting time.
_title_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="chat-title")


@router.post("", status_code=status.HTTP_201_CREATED)
def create_chat(
    payload: ChatCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conv = Conversation(
        user_id=current_user.id,
        title=payload.title or DEFAULT_TITLE,
        subject=payload.subject,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return {
        "id": conv.id,
        "title": conv.title,
        "subject": conv.subject,
        "created_at": conv.created_at,
        "updated_at": conv.updated_at,
        "messages": [],
    }


@router.get("")
def list_chats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    convs = (
        db.query(Conversation)
        .filter(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc())
        .all()
    )
    return [
        {
            "id": c.id,
            "title": c.title,
            "subject": c.subject,
            "created_at": c.created_at,
            "updated_at": c.updated_at,
        }
        for c in convs
    ]


@router.get("/models")
def get_chat_models(current_user: User = Depends(get_current_user)):
    """Chat models a message can be answered with; pass an id as `model` when sending."""
    return {"default": default_model(), "models": list_models()}


@router.get("/{chat_id}")
def get_chat(
    chat_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conv = (
        db.query(Conversation)
        .filter(Conversation.id == chat_id, Conversation.user_id == current_user.id)
        .first()
    )
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found."
        )
    return {
        "id": conv.id,
        "title": conv.title,
        "subject": conv.subject,
        "created_at": conv.created_at,
        "updated_at": conv.updated_at,
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "sources": m.sources,
                "is_fallback": m.is_fallback,
                "model": m.model,
                "created_at": m.created_at,
            }
            for m in conv.messages
        ],
    }


@router.post("/{chat_id}/messages")
def send_message(
    chat_id: str,
    payload: MessageCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conv = _owned_conversation(db, chat_id, current_user)
    model = _resolve_model(payload.model)
    history = [{"role": m.role, "content": m.content} for m in conv.messages[-6:]]
    title_job = _start_title(conv, payload.content)
    user_msg = _save_user_message(db, conv, payload.content)

    rag_result = run_rag_tutor(db, user_msg.content, history, model)
    _apply_title(conv, title_job)
    assistant_msg = _save_assistant_message(db, conv, rag_result, model)

    return {
        "conversation_id": conv.id,
        "title": conv.title,
        "subject": conv.subject,
        "user_message": _message_json(user_msg),
        "assistant_message": _message_json(assistant_msg),
    }


@router.post("/{chat_id}/messages/stream")
def stream_message(
    chat_id: str,
    payload: MessageCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Same as POST /messages, but answers as Server-Sent Events:
      user_message -> status -> token (many) -> done (saved assistant message + sources)
    """
    conv = _owned_conversation(db, chat_id, current_user)
    model = _resolve_model(payload.model)
    history = [{"role": m.role, "content": m.content} for m in conv.messages[-6:]]
    title_job = _start_title(conv, payload.content)
    # Saved before streaming starts, so the question survives a dropped connection.
    user_msg = _save_user_message(db, conv, payload.content)
    db.commit()
    user_json = _message_json(user_msg)
    conv_id, question = conv.id, user_msg.content

    def events():
        # The request's session may be closed while the stream runs; use our own.
        with SessionLocal() as stream_db:
            yield _sse("user_message", user_json)
            yield _sse("status", {"text": "Searching your textbooks…"})
            try:
                for kind, value in stream_rag_tutor(stream_db, question, history, model):
                    if kind == "context":
                        found = len(value["retrieved_chunks"])
                        text = f"Found {found} relevant textbook passage{'s' if found != 1 else ''}. Writing answer…" if found else "Writing answer…"
                        yield _sse("status", {"text": text})
                    elif kind == "token":
                        yield _sse("token", {"text": value})
                    elif kind == "done":
                        stream_conv = stream_db.get(Conversation, conv_id)
                        _apply_title(stream_conv, title_job)
                        assistant_msg = _save_assistant_message(stream_db, stream_conv, value, model)
                        yield _sse(
                            "done",
                            {
                                "conversation_id": stream_conv.id,
                                "title": stream_conv.title,
                                "subject": stream_conv.subject,
                                "assistant_message": _message_json(assistant_msg),
                            },
                        )
            except Exception:
                logger.exception("Streaming answer failed")
                yield _sse("error", {"message": "Something went wrong while answering. Please try again."})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        # Disable proxy buffering so tokens reach the browser immediately.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


def _owned_conversation(db: Session, chat_id: str, user: User) -> Conversation:
    conv = (
        db.query(Conversation)
        .filter(Conversation.id == chat_id, Conversation.user_id == user.id)
        .first()
    )
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found."
        )
    return conv


def _resolve_model(requested: Optional[str]) -> str:
    model = requested or default_model()
    if requested and not any(m["id"] == model for m in list_models()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unknown model. See GET /api/chats/models for the list.",
        )
    if requested and not model_available(model):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No API key is configured for {model}.",
        )
    return model


def _save_user_message(db: Session, conv: Conversation, content: str) -> Message:
    user_msg = Message(
        conversation_id=conv.id,
        role="user",
        content=content.strip(),
        sources=[],
        is_fallback=False,
    )
    db.add(user_msg)
    if conv.title == DEFAULT_TITLE:
        conv.title = fallback_title(content)
    conv.updated_at = utc_now()
    db.flush()
    return user_msg


def _start_title(conv: Conversation, content: str) -> Optional[Future]:
    """For a chat's first message, start writing its title in the background."""
    if conv.title != DEFAULT_TITLE:
        return None
    return _title_pool.submit(generate_title, content)


def _apply_title(conv: Conversation, job: Optional[Future]) -> None:
    """Swap in the AI title (committed with the answer); keep the shortened message otherwise."""
    if job is None:
        return
    try:
        title = job.result(timeout=8)
    except Exception:
        title = None
    if title:
        conv.title = title


def _save_assistant_message(db: Session, conv: Conversation, rag_result: dict, model: str) -> Message:
    if rag_result.get("detected_subject") and not conv.subject:
        conv.subject = rag_result["detected_subject"]
    conv.updated_at = utc_now()
    assistant_msg = Message(
        conversation_id=conv.id,
        role="assistant",
        content=rag_result["answer"],
        sources=rag_result.get("sources", []),
        is_fallback=rag_result.get("is_fallback", False),
        model=None if rag_result.get("is_fallback") else model,
    )
    db.add(assistant_msg)
    db.commit()
    db.refresh(assistant_msg)
    return assistant_msg


def _message_json(m: Message) -> dict:
    return {
        "id": m.id,
        "role": m.role,
        "content": m.content,
        "sources": m.sources,
        "is_fallback": m.is_fallback,
        "model": m.model,
        "created_at": m.created_at,
    }


@router.patch("/{chat_id}")
def rename_chat(
    chat_id: str,
    payload: ChatUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conv = (
        db.query(Conversation)
        .filter(Conversation.id == chat_id, Conversation.user_id == current_user.id)
        .first()
    )
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found."
        )
    conv.title = payload.title.strip()
    conv.updated_at = utc_now()
    db.commit()
    return {"id": conv.id, "title": conv.title}


@router.delete("/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chat(
    chat_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    conv = (
        db.query(Conversation)
        .filter(Conversation.id == chat_id, Conversation.user_id == current_user.id)
        .first()
    )
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found."
        )
    db.delete(conv)
    db.commit()
    return None