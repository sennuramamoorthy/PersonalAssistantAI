"""Dashboard service — daily briefing, stats, pending actions."""

from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.user import User
from app.models.travel import Trip
from app.services.email_service import get_inbox
from app.services.calendar_service import get_events, detect_conflicts
from app.integrations.anthropic_client import get_anthropic_client, SYSTEM_PROMPT


async def get_dashboard_stats(db: AsyncSession, user: User) -> dict:
    """Gather quick stats for the dashboard."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_end = (now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)).isoformat()
    week_end = (now + timedelta(days=7)).isoformat()

    unread_count = 0
    todays_meetings = 0
    weeks_events = 0
    upcoming_trips = 0

    # Email stats
    try:
        inbox = await get_inbox(db, user, max_results=50)
        unread_count = sum(1 for e in inbox.get("emails", []) if e.get("is_unread"))
    except Exception:
        pass

    # Today's meetings
    try:
        today_events = await get_events(db, user, start_date=today_start, end_date=today_end)
        todays_meetings = len([
            e for e in today_events.get("events", [])
            if e.get("attendees") or e.get("meeting_url")
        ])
    except Exception:
        pass

    # Week's events
    try:
        week_events = await get_events(db, user, start_date=today_start, end_date=week_end)
        weeks_events = week_events.get("total", 0)
    except Exception:
        pass

    # Upcoming trips
    try:
        result = await db.execute(
            select(func.count(Trip.id)).where(
                Trip.user_id == user.id, Trip.status == "upcoming"
            )
        )
        upcoming_trips = result.scalar() or 0
    except Exception:
        pass

    return {
        "unread_emails": unread_count,
        "todays_meetings": todays_meetings,
        "weeks_events": weeks_events,
        "upcoming_trips": upcoming_trips,
    }


async def get_pending_actions(db: AsyncSession, user: User) -> list[dict]:
    """Gather items needing the Chairman's attention."""
    actions: list[dict] = []
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_end = (now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)).isoformat()

    # Unread high-priority emails (just count for now)
    try:
        inbox = await get_inbox(db, user, max_results=20)
        unread = [e for e in inbox.get("emails", []) if e.get("is_unread")]
        if unread:
            actions.append({
                "type": "email",
                "title": f"{len(unread)} unread email{'s' if len(unread) != 1 else ''}",
                "description": f"You have {len(unread)} unread messages across your inboxes.",
                "action_url": "/dashboard/email",
                "priority": "high" if len(unread) > 5 else "normal",
            })
    except Exception:
        pass

    # Calendar conflicts today
    try:
        today_events = await get_events(db, user, start_date=today_start, end_date=today_end)
        conflicts = detect_conflicts(today_events.get("events", []))
        if conflicts:
            actions.append({
                "type": "calendar",
                "title": f"{len(conflicts)} scheduling conflict{'s' if len(conflicts) != 1 else ''}",
                "description": "You have overlapping meetings today that need attention.",
                "action_url": "/dashboard/calendar",
                "priority": "urgent",
            })
    except Exception:
        pass

    # Pending meeting invites (events with "needsAction" status)
    try:
        week_end = (now + timedelta(days=7)).isoformat()
        week_events = await get_events(db, user, start_date=today_start, end_date=week_end)
        pending = [
            e for e in week_events.get("events", [])
            if e.get("response_status") == "needsAction" and e.get("attendees")
        ]
        if pending:
            actions.append({
                "type": "meeting",
                "title": f"{len(pending)} pending meeting invite{'s' if len(pending) != 1 else ''}",
                "description": "Meeting invitations awaiting your response.",
                "action_url": "/dashboard/meetings",
                "priority": "high",
            })
    except Exception:
        pass

    # Sort by priority
    priority_order = {"urgent": 0, "high": 1, "normal": 2, "low": 3}
    actions.sort(key=lambda a: priority_order.get(a.get("priority", "normal"), 2))

    return actions


async def generate_ai_briefing(db: AsyncSession, user: User) -> str:
    """Generate an AI-powered daily briefing for the Chairman."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_end = (now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)).isoformat()

    # Gather context
    email_summary = ""
    calendar_summary = ""
    trip_summary = ""

    try:
        inbox = await get_inbox(db, user, max_results=10)
        emails = inbox.get("emails", [])
        unread = [e for e in emails if e.get("is_unread")]
        if unread:
            email_lines = [f"- From: {e.get('from', '?')} | Subject: {e.get('subject', '?')}" for e in unread[:5]]
            email_summary = f"Unread emails ({len(unread)} total):\n" + "\n".join(email_lines)
    except Exception:
        email_summary = "Unable to fetch emails."

    try:
        today_events = await get_events(db, user, start_date=today_start, end_date=today_end)
        events = today_events.get("events", [])
        if events:
            event_lines = [f"- {e.get('start', '?')[:16]} | {e.get('title', 'Untitled')}" for e in events]
            calendar_summary = f"Today's schedule ({len(events)} events):\n" + "\n".join(event_lines)
        else:
            calendar_summary = "No events scheduled for today."
    except Exception:
        calendar_summary = "Unable to fetch calendar."

    try:
        result = await db.execute(
            select(Trip).where(Trip.user_id == user.id, Trip.status == "upcoming").limit(3)
        )
        trips = result.scalars().all()
        if trips:
            trip_lines = [f"- {t.title} to {t.destination} ({t.start_date} → {t.end_date})" for t in trips]
            trip_summary = f"Upcoming trips:\n" + "\n".join(trip_lines)
    except Exception:
        pass

    # Generate briefing
    client = get_anthropic_client()

    prompt = f"""Generate a concise daily briefing for the Chairman. Today is {now.strftime('%A, %B %d, %Y')}.

{email_summary}

{calendar_summary}

{trip_summary if trip_summary else 'No upcoming trips.'}

Provide:
1. A warm greeting and date
2. Key highlights for the day (2-3 bullet points)
3. Items needing attention
4. A brief look-ahead at the rest of the week if relevant

Keep it concise — 150 words max. Use a professional but warm tone."""

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=400,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    return response.content[0].text
