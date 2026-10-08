from datetime import datetime, timezone
from typing import Literal
import uuid

from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Chat(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = "demo-user"
    title: str = "New JEE conversation"
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class ChatCreate(BaseModel):
    title: str | None = None


class ChatRename(BaseModel):
    title: str = Field(min_length=1, max_length=80)


class Message(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    chat_id: str
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime = Field(default_factory=utc_now)


class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=8000)


class ChatDetail(BaseModel):
    chat: Chat
    messages: list[Message]


class MessageResponse(BaseModel):
    user_message: Message
    assistant_message: Message