"""Calendar API endpoints — unified calendar view, event management, conflict detection."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services.calendar_service import (
    get_events,
    get_event_detail,
    create_event,
    respond_to_event,
    delete_event,
    detect_conflicts,
    CalendarServiceError,
)

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


# --- Schemas ---

class CreateEventRequest(BaseModel):
    provider: str
    title: str
    start: str  # ISO datetime
    end: str
    description: str = ""
    location: str = ""
    attendees: list[str] = []
    timezone: str = "UTC"


class EventResponseRequest(BaseModel):
    provider: str
    event_id: str
    response: str  # "accepted", "declined", "tentative"


class DeleteEventRequest(BaseModel):
    provider: str
    event_id: str


# --- Routes ---

@router.get("/events")
async def api_get_events(
    start_date: str | None = Query(None, description="ISO start date"),
    end_date: str | None = Query(None, description="ISO end date"),
    provider: str | None = Query(None, description="Filter by provider"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch calendar events from connected accounts."""
    return await get_events(db, user, start_date=start_date, end_date=end_date, provider=provider)


@router.get("/events/{provider}/{event_id}")
async def api_get_event(
    provider: str,
    event_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single calendar event."""
    if provider not in ("google", "microsoft"):
        raise HTTPException(status_code=400, detail="Invalid provider")
    try:
        return await get_event_detail(db, user, event_id, provider)
    except CalendarServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/events")
async def api_create_event(
    body: CreateEventRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new calendar event."""
    if body.provider not in ("google", "microsoft"):
        raise HTTPException(status_code=400, detail="Invalid provider")
    try:
        return await create_event(
            db, user, body.provider, body.title, body.start, body.end,
            body.description, body.location, body.attendees or None, body.timezone,
        )
    except CalendarServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/events/respond")
async def api_respond_to_event(
    body: EventResponseRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Accept, decline, or tentatively accept a calendar event."""
    if body.provider not in ("google", "microsoft"):
        raise HTTPException(status_code=400, detail="Invalid provider")
    if body.response not in ("accepted", "declined", "tentative"):
        raise HTTPException(status_code=400, detail="Invalid response. Use: accepted, declined, tentative")
    try:
        return await respond_to_event(db, user, body.event_id, body.provider, body.response)
    except CalendarServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/events/delete")
async def api_delete_event(
    body: DeleteEventRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a calendar event."""
    if body.provider not in ("google", "microsoft"):
        raise HTTPException(status_code=400, detail="Invalid provider")
    try:
        return await delete_event(db, user, body.event_id, body.provider)
    except CalendarServiceError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/conflicts")
async def api_get_conflicts(
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Detect scheduling conflicts in the calendar."""
    result = await get_events(db, user, start_date=start_date, end_date=end_date)
    conflicts = detect_conflicts(result["events"])
    return {"conflicts": conflicts, "total": len(conflicts)}
