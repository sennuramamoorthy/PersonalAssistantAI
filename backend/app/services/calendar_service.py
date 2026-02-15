"""Calendar service — unified view across Google Calendar and Outlook Calendar."""

from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.encryption import decrypt_token, encrypt_token
from app.models.oauth_token import OAuthToken
from app.models.user import User
from app.integrations.google_calendar import GoogleCalendarClient, parse_google_event
from app.integrations.outlook_calendar import OutlookCalendarClient, parse_outlook_event
from app.integrations.gmail import refresh_google_token
from app.integrations.microsoft_graph import refresh_microsoft_token


class CalendarServiceError(Exception):
    pass


async def _get_oauth_token(db: AsyncSession, user_id: str, provider: str) -> OAuthToken | None:
    result = await db.execute(
        select(OAuthToken).where(
            OAuthToken.user_id == user_id, OAuthToken.provider == provider
        )
    )
    return result.scalar_one_or_none()


async def _get_valid_access_token(db: AsyncSession, token_record: OAuthToken) -> str:
    """Return a valid access token, refreshing if expired."""
    access_token = decrypt_token(token_record.access_token_encrypted)

    if token_record.token_expiry and token_record.token_expiry < datetime.now(timezone.utc):
        refresh_tok = decrypt_token(token_record.refresh_token_encrypted)

        if token_record.provider == "google":
            new_tokens = await refresh_google_token(refresh_tok)
        else:
            new_tokens = await refresh_microsoft_token(refresh_tok)

        access_token = new_tokens["access_token"]
        token_record.access_token_encrypted = encrypt_token(access_token)

        if "refresh_token" in new_tokens:
            token_record.refresh_token_encrypted = encrypt_token(new_tokens["refresh_token"])

        if "expires_in" in new_tokens:
            token_record.token_expiry = datetime.now(timezone.utc) + timedelta(
                seconds=new_tokens["expires_in"]
            )

        await db.commit()

    return access_token


async def get_events(
    db: AsyncSession,
    user: User,
    start_date: str | None = None,
    end_date: str | None = None,
    provider: str | None = None,
) -> dict:
    """Fetch calendar events from connected accounts."""
    # Default to current week
    now = datetime.now(timezone.utc)
    if not start_date:
        # Start of current week (Monday)
        start_of_week = now - timedelta(days=now.weekday())
        start_date = start_of_week.replace(hour=0, minute=0, second=0).isoformat()
    if not end_date:
        end_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00")) + timedelta(days=7)
        end_date = end_dt.isoformat()

    all_events: list[dict] = []
    errors: list[str] = []

    providers_to_fetch = []
    if provider in (None, "google") and user.google_connected:
        providers_to_fetch.append("google")
    if provider in (None, "microsoft") and user.microsoft_connected:
        providers_to_fetch.append("microsoft")

    for prov in providers_to_fetch:
        try:
            token_record = await _get_oauth_token(db, user.id, prov)
            if not token_record:
                continue

            access_token = await _get_valid_access_token(db, token_record)

            if prov == "google":
                client = GoogleCalendarClient(access_token)
                result = await client.list_events(
                    time_min=start_date,
                    time_max=end_date,
                )
                for raw in result.get("items", []):
                    all_events.append(parse_google_event(raw))

            elif prov == "microsoft":
                client = OutlookCalendarClient(access_token)
                result = await client.list_events(
                    start_datetime=start_date,
                    end_datetime=end_date,
                )
                for raw in result.get("value", []):
                    all_events.append(parse_outlook_event(raw))

        except Exception as e:
            errors.append(f"{prov}: {str(e)}")

    # Sort by start time
    all_events.sort(key=lambda e: e.get("start", ""))

    return {
        "events": all_events,
        "total": len(all_events),
        "start_date": start_date,
        "end_date": end_date,
        "providers_connected": providers_to_fetch,
        "errors": errors if errors else None,
    }


async def get_event_detail(
    db: AsyncSession, user: User, event_id: str, provider: str
) -> dict:
    """Fetch a single calendar event."""
    token_record = await _get_oauth_token(db, user.id, provider)
    if not token_record:
        raise CalendarServiceError(f"{provider} account not connected")

    access_token = await _get_valid_access_token(db, token_record)

    if provider == "google":
        client = GoogleCalendarClient(access_token)
        raw = await client.get_event(event_id)
        return parse_google_event(raw)
    else:
        client = OutlookCalendarClient(access_token)
        raw = await client.get_event(event_id)
        return parse_outlook_event(raw)


async def create_event(
    db: AsyncSession,
    user: User,
    provider: str,
    title: str,
    start: str,
    end: str,
    description: str = "",
    location: str = "",
    attendees: list[str] | None = None,
    tz: str = "UTC",
) -> dict:
    """Create a new calendar event."""
    token_record = await _get_oauth_token(db, user.id, provider)
    if not token_record:
        raise CalendarServiceError(f"{provider} account not connected")

    access_token = await _get_valid_access_token(db, token_record)

    if provider == "google":
        client = GoogleCalendarClient(access_token)
        raw = await client.create_event(
            summary=title, start=start, end=end,
            description=description, location=location,
            attendees=attendees, timezone=tz,
        )
        return parse_google_event(raw)
    else:
        client = OutlookCalendarClient(access_token)
        raw = await client.create_event(
            subject=title, start=start, end=end,
            body=description, location=location,
            attendees=attendees, timezone=tz,
        )
        return parse_outlook_event(raw)


async def respond_to_event(
    db: AsyncSession,
    user: User,
    event_id: str,
    provider: str,
    response: str,
) -> dict:
    """Respond to a calendar event (accept/decline/tentative)."""
    token_record = await _get_oauth_token(db, user.id, provider)
    if not token_record:
        raise CalendarServiceError(f"{provider} account not connected")

    access_token = await _get_valid_access_token(db, token_record)

    if provider == "google":
        # Google uses: accepted, declined, tentative
        client = GoogleCalendarClient(access_token)
        await client.respond_to_event(event_id, response)
    else:
        # Microsoft uses: accept, decline, tentativelyAccept
        ms_response_map = {
            "accepted": "accept",
            "declined": "decline",
            "tentative": "tentativelyAccept",
        }
        ms_response = ms_response_map.get(response, response)
        client = OutlookCalendarClient(access_token)
        await client.respond_to_event(event_id, ms_response)

    return {"status": "ok", "response": response}


async def delete_event(
    db: AsyncSession, user: User, event_id: str, provider: str
) -> dict:
    """Delete a calendar event."""
    token_record = await _get_oauth_token(db, user.id, provider)
    if not token_record:
        raise CalendarServiceError(f"{provider} account not connected")

    access_token = await _get_valid_access_token(db, token_record)

    if provider == "google":
        client = GoogleCalendarClient(access_token)
        await client.delete_event(event_id)
    else:
        client = OutlookCalendarClient(access_token)
        await client.delete_event(event_id)

    return {"status": "deleted"}


def detect_conflicts(events: list[dict]) -> list[dict]:
    """Detect scheduling conflicts among events."""
    conflicts = []
    timed_events = [e for e in events if not e.get("is_all_day") and e.get("start") and e.get("end")]

    for i in range(len(timed_events)):
        for j in range(i + 1, len(timed_events)):
            e1 = timed_events[i]
            e2 = timed_events[j]
            # Simple overlap check
            if e1["start"] < e2["end"] and e2["start"] < e1["end"]:
                conflicts.append({
                    "event_1": {"id": e1["id"], "title": e1["title"], "start": e1["start"], "end": e1["end"], "provider": e1["provider"]},
                    "event_2": {"id": e2["id"], "title": e2["title"], "start": e2["start"], "end": e2["end"], "provider": e2["provider"]},
                })

    return conflicts
