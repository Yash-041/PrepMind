from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Response, status

from lib.db import db
from models.chat import Chat, ChatCreate, ChatDetail, ChatRename, Message, MessageCreate, MessageResponse
from services.mock_tutor import generate_reply

router = APIRouter(prefix="/chats", tags=["chats"])


def _as_chat(document: dict) -> Chat:
    document.pop("_id", None)
    return Chat(**document)


def _as_message(document: dict) -> Message:
    document.pop("_id", None)
    return Message(**document)


@router.post("", response_model=Chat, status_code=status.HTTP_201_CREATED)
async def create_chat(payload: ChatCreate) -> Chat:
    chat = Chat(title=payload.title.strip() if payload.title else "New JEE conversation")
    await db.chats.insert_one(chat.model_dump())
    return chat


@router.get("", response_model=list[Chat])
async def list_chats() -> list[Chat]:
    documents = await db.chats.find({"user_id": "demo-user"}).sort("updated_at", -1).to_list(100)
    return [_as_chat(document) for document in documents]


@router.get("/{chat_id}", response_model=ChatDetail)
async def get_chat(chat_id: str) -> ChatDetail:
    document = await db.chats.find_one({"id": chat_id, "user_id": "demo-user"})
    if not document:
        raise HTTPException(status_code=404, detail="Chat not found")
    messages = await db.messages.find({"chat_id": chat_id}).sort("created_at", 1).to_list(500)
    return ChatDetail(chat=_as_chat(document), messages=[_as_message(message) for message in messages])


@router.post("/{chat_id}/messages", response_model=MessageResponse)
async def send_message(chat_id: str, payload: MessageCreate) -> MessageResponse:
    document = await db.chats.find_one({"id": chat_id, "user_id": "demo-user"})
    if not document:
        raise HTTPException(status_code=404, detail="Chat not found")

    now = datetime.now(timezone.utc)
    user_message = Message(chat_id=chat_id, role="user", content=payload.content.strip(), created_at=now)
    assistant_message = Message(chat_id=chat_id, role="assistant", content=generate_reply(payload.content), created_at=datetime.now(timezone.utc))
    await db.messages.insert_many([user_message.model_dump(), assistant_message.model_dump()])

    title = document.get("title", "New JEE conversation")
    if title == "New JEE conversation":
        title = payload.content.strip()[:54] or title
    await db.chats.update_one(
        {"id": chat_id},
        {"$set": {"title": title, "updated_at": assistant_message.created_at}},
    )
    return MessageResponse(user_message=user_message, assistant_message=assistant_message)


@router.patch("/{chat_id}", response_model=Chat)
async def rename_chat(chat_id: str, payload: ChatRename) -> Chat:
    updated = datetime.now(timezone.utc)
    result = await db.chats.find_one_and_update(
        {"id": chat_id, "user_id": "demo-user"},
        {"$set": {"title": payload.title.strip(), "updated_at": updated}},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Chat not found")
    return _as_chat(result)


@router.delete("/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat(chat_id: str) -> Response:
    result = await db.chats.delete_one({"id": chat_id, "user_id": "demo-user"})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Chat not found")
    await db.messages.delete_many({"chat_id": chat_id})
    return Response(status_code=status.HTTP_204_NO_CONTENT)