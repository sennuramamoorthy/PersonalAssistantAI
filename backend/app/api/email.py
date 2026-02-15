"""Email API endpoints — inbox, read, categorize, draft, send."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services.email_service import (
    get_inbox,
    get_email_detail,
    ai_categorize,
    ai_draft_response,
    send_reply,
    mark_as_read,
    archive_email,
    EmailServiceError,
)

router = APIRouter(prefix="/api/email", tags=["email"])


# --- Schemas ---

class DraftRequest(BaseModel):
    from_addr: str
    subject: str
    body: str
    sender_type: str = "unknown"
    instruction: str = ""


class SendRequest(BaseModel):
    provider: str
    to: str
    subject: str
    body: str
    reply_to_id: str | None = None


class ActionRequest(BaseModel):
    provider: str
    email_id: str


# --- Routes ---

@router.get("/inbox")
async def api_get_inbox(
    provider: str | None = Query(None, description="Filter by provider: google or microsoft"),
    query: str = Query("", description="Search query"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch emails from connected accounts with optional filtering."""
    return await get_inbox(db, user, provider=provider, query=query, page=page, page_size=page_size)


@router.get("/message/{provider}/{email_id}")
async def api_get_email(
    provider: str,
    email_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single email with full body content."""
    if provider not in ("google", "microsoft"):
        raise HTTPException(status_code=400, detail="Invalid provider")
    try:
        return await get_email_detail(db, user, email_id, provider)
    except EmailServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/categorize")
async def api_categorize_email(
    body: DraftRequest,
    user: User = Depends(get_current_user),
):
    """Use AI to categorize an email (sender type, priority, summary)."""
    result = await ai_categorize(body.from_addr, body.subject, body.body)
    return result


@router.post("/draft")
async def api_draft_reply(
    body: DraftRequest,
    user: User = Depends(get_current_user),
):
    """Use AI to draft a reply to an email."""
    draft = await ai_draft_response(
        body.from_addr, body.subject, body.body, body.sender_type, body.instruction
    )
    return {"draft": draft}


@router.post("/send")
async def api_send_email(
    body: SendRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Send an email (new or reply) through a connected account."""
    if body.provider not in ("google", "microsoft"):
        raise HTTPException(status_code=400, detail="Invalid provider")
    try:
        result = await send_reply(
            db, user, body.provider, body.to, body.subject, body.body, body.reply_to_id
        )
        return {"status": "sent", "result": result}
    except EmailServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/mark-read")
async def api_mark_read(
    body: ActionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark an email as read."""
    try:
        await mark_as_read(db, user, body.email_id, body.provider)
        return {"status": "ok"}
    except EmailServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/archive")
async def api_archive(
    body: ActionRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Archive an email."""
    try:
        await archive_email(db, user, body.email_id, body.provider)
        return {"status": "ok"}
    except EmailServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))
