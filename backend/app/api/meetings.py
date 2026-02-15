"""Meetings API — AI-powered meeting management, briefings, and scheduling."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services.calendar_service import get_events, CalendarServiceError
from app.services.meeting_service import (
    ai_recommend_response,
    ai_generate_briefing,
    ai_suggest_meeting_times,
    ai_draft_meeting_agenda,
)

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


# --- Schemas ---

class RecommendRequest(BaseModel):
    title: str
    organizer: str
    description: str = ""
    attendees: list[dict] = []
    start: str
    end: str


class BriefingRequest(BaseModel):
    title: str
    organizer: str
    description: str = ""
    attendees: list[dict] = []


class SuggestTimesRequest(BaseModel):
    title: str
    duration_minutes: int = 60
    attendees: list[str] = []
    preferred_start_hour: int = 9
    preferred_end_hour: int = 17
    days_ahead: int = 5


class AgendaRequest(BaseModel):
    title: str
    description: str = ""
    attendees: list[dict] = []
    duration_minutes: int = 60


# --- Routes ---

@router.get("/")
async def api_get_meetings(
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all meetings (events with attendees) from connected calendars."""
    result = await get_events(db, user, start_date=start_date, end_date=end_date)

    # Filter to only events that have attendees (i.e., meetings)
    meetings = [
        e for e in result["events"]
        if len(e.get("attendees", [])) > 0 or e.get("meeting_link")
    ]

    # Separate pending invitations vs confirmed meetings
    pending = [m for m in meetings if m.get("my_response") in ("needsAction", "tentative")]
    confirmed = [m for m in meetings if m.get("my_response") == "accepted"]

    return {
        "meetings": meetings,
        "pending": pending,
        "confirmed": confirmed,
        "total": len(meetings),
        "pending_count": len(pending),
    }


@router.post("/recommend")
async def api_recommend_response(
    body: RecommendRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI recommends whether to accept, decline, or tentatively accept a meeting."""
    existing = await get_events(db, user, start_date=body.start, end_date=body.end)

    result = await ai_recommend_response(
        title=body.title,
        organizer=body.organizer,
        description=body.description,
        attendees=body.attendees,
        start=body.start,
        end=body.end,
        existing_events=existing.get("events", []),
    )
    return result


@router.post("/briefing")
async def api_generate_briefing(
    body: BriefingRequest,
    user: User = Depends(get_current_user),
):
    """Generate AI-powered pre-meeting briefing notes."""
    briefing = await ai_generate_briefing(
        title=body.title,
        organizer=body.organizer,
        description=body.description,
        attendees=body.attendees,
    )
    return {"briefing": briefing}


@router.post("/suggest-times")
async def api_suggest_times(
    body: SuggestTimesRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI suggests optimal meeting times based on existing schedule."""
    existing = await get_events(db, user)
    suggestions = await ai_suggest_meeting_times(
        title=body.title,
        duration_minutes=body.duration_minutes,
        attendees=body.attendees,
        existing_events=existing.get("events", []),
        preferred_hours=(body.preferred_start_hour, body.preferred_end_hour),
        days_ahead=body.days_ahead,
    )
    return {"suggestions": suggestions}


@router.post("/agenda")
async def api_draft_agenda(
    body: AgendaRequest,
    user: User = Depends(get_current_user),
):
    """AI generates a meeting agenda."""
    agenda = await ai_draft_meeting_agenda(
        title=body.title,
        description=body.description,
        attendees=body.attendees,
        duration_minutes=body.duration_minutes,
    )
    return {"agenda": agenda}
