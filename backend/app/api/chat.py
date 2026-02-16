"""Chat API endpoints — conversation management and AI streaming."""

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services.chat_service import (
    create_conversation,
    list_conversations,
    get_conversation,
    update_conversation_title,
    delete_conversation,
    get_messages,
    save_user_message,
    get_recent_messages,
    stream_ai_response,
    generate_title_for_conversation,
    gather_user_context,
    _build_enhanced_system_prompt,
    ChatServiceError,
)

router = APIRouter(prefix="/api/chat", tags=["chat"])


# --- Schemas ---

class UpdateConversationRequest(BaseModel):
    title: str


class SendMessageRequest(BaseModel):
    content: str


# --- Conversation Routes ---

@router.get("/conversations")
async def api_list_conversations(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all conversations for the current user."""
    return await list_conversations(db, user.id)


@router.post("/conversations")
async def api_create_conversation(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new conversation."""
    return await create_conversation(db, user.id)


@router.get("/conversations/{conversation_id}")
async def api_get_conversation(
    conversation_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single conversation."""
    try:
        return await get_conversation(db, conversation_id, user.id)
    except ChatServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/conversations/{conversation_id}")
async def api_update_conversation(
    conversation_id: str,
    body: UpdateConversationRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a conversation's title."""
    try:
        return await update_conversation_title(db, conversation_id, user.id, body.title)
    except ChatServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/conversations/{conversation_id}")
async def api_delete_conversation(
    conversation_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a conversation."""
    try:
        return await delete_conversation(db, conversation_id, user.id)
    except ChatServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


# --- Message Routes ---

@router.get("/conversations/{conversation_id}/messages")
async def api_get_messages(
    conversation_id: str,
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get messages for a conversation."""
    try:
        return await get_messages(db, conversation_id, user.id, limit=limit)
    except ChatServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/conversations/{conversation_id}/messages")
async def api_send_message(
    conversation_id: str,
    body: SendMessageRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send a message and get a streaming AI response (SSE).

    Saves the user message first, then loads conversation history,
    and returns a StreamingResponse with SSE events.
    """
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    try:
        # Verify ownership
        conv = await get_conversation(db, conversation_id, user.id)
    except ChatServiceError as e:
        raise HTTPException(status_code=404, detail=str(e))

    # Save user message
    user_msg = await save_user_message(db, conversation_id, body.content.strip())

    # Load recent messages for context
    history = await get_recent_messages(db, conversation_id, limit=20)

    # Gather live context from email, calendar, and travel
    user_context = await gather_user_context(db, user)
    system_prompt = _build_enhanced_system_prompt(user_context)

    # Auto-generate title on first message
    if conv.get("message_count", 0) <= 1:
        asyncio.create_task(
            generate_title_for_conversation(conversation_id, body.content.strip())
        )

    # Return streaming response
    return StreamingResponse(
        stream_ai_response(conversation_id, history, system_prompt=system_prompt),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )
