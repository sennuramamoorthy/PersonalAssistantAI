"""Travel service — trip CRUD, calendar blocking, AI itinerary assistance, email scanning."""

import asyncio
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.travel import Trip, TripSegment, TripDocument
from app.models.user import User
from app.services.calendar_service import create_event, get_events, CalendarServiceError
from app.integrations.anthropic_client import get_anthropic_client, SYSTEM_PROMPT, extract_travel_from_email


class TravelServiceError(Exception):
    pass


# --- Trip CRUD ---

async def list_trips(
    db: AsyncSession,
    user: User,
    status: str | None = None,
) -> dict:
    """List trips for a user, optionally filtered by status."""
    query = (
        select(Trip)
        .where(Trip.user_id == user.id)
        .options(selectinload(Trip.segments), selectinload(Trip.documents))
        .order_by(Trip.start_date.desc())
    )
    if status:
        query = query.where(Trip.status == status)

    result = await db.execute(query)
    trips = result.scalars().all()

    return {
        "trips": [_serialize_trip(t) for t in trips],
        "total": len(trips),
    }


async def get_trip(db: AsyncSession, user: User, trip_id: str) -> dict:
    """Get a single trip with all segments and documents."""
    result = await db.execute(
        select(Trip)
        .where(Trip.id == trip_id, Trip.user_id == user.id)
        .options(selectinload(Trip.segments), selectinload(Trip.documents))
    )
    trip = result.scalar_one_or_none()
    if not trip:
        raise TravelServiceError("Trip not found")
    return _serialize_trip(trip)


async def create_trip(
    db: AsyncSession,
    user: User,
    title: str,
    destination: str,
    start_date: str,
    end_date: str,
    notes: str = "",
) -> dict:
    """Create a new trip."""
    trip = Trip(
        user_id=user.id,
        title=title,
        destination=destination,
        start_date=start_date,
        end_date=end_date,
        notes=notes,
        status="upcoming",
    )
    db.add(trip)
    await db.commit()

    # Re-fetch with eager loading to avoid lazy-load in async context
    result = await db.execute(
        select(Trip)
        .where(Trip.id == trip.id)
        .options(selectinload(Trip.segments), selectinload(Trip.documents))
    )
    trip = result.scalar_one()
    return _serialize_trip(trip)


async def update_trip(
    db: AsyncSession,
    user: User,
    trip_id: str,
    updates: dict,
) -> dict:
    """Update trip details."""
    result = await db.execute(
        select(Trip)
        .where(Trip.id == trip_id, Trip.user_id == user.id)
        .options(selectinload(Trip.segments), selectinload(Trip.documents))
    )
    trip = result.scalar_one_or_none()
    if not trip:
        raise TravelServiceError("Trip not found")

    allowed_fields = {"title", "destination", "start_date", "end_date", "notes", "status"}
    for key, value in updates.items():
        if key in allowed_fields:
            setattr(trip, key, value)

    await db.commit()
    await db.refresh(trip)
    return _serialize_trip(trip)


async def delete_trip(db: AsyncSession, user: User, trip_id: str) -> dict:
    """Delete a trip and all its segments/documents."""
    result = await db.execute(
        select(Trip).where(Trip.id == trip_id, Trip.user_id == user.id)
    )
    trip = result.scalar_one_or_none()
    if not trip:
        raise TravelServiceError("Trip not found")

    await db.delete(trip)
    await db.commit()
    return {"status": "deleted"}


# --- Segments ---

async def add_segment(
    db: AsyncSession,
    user: User,
    trip_id: str,
    segment_type: str,
    title: str,
    start_time: str,
    end_time: str,
    location_from: str = "",
    location_to: str = "",
    confirmation_number: str = "",
    carrier: str = "",
    details: str = "",
    cost: float | None = None,
    currency: str = "USD",
) -> dict:
    """Add a segment (flight, hotel, etc.) to a trip."""
    # Verify trip exists and belongs to user
    result = await db.execute(
        select(Trip).where(Trip.id == trip_id, Trip.user_id == user.id)
    )
    trip = result.scalar_one_or_none()
    if not trip:
        raise TravelServiceError("Trip not found")

    segment = TripSegment(
        trip_id=trip_id,
        segment_type=segment_type,
        title=title,
        start_time=start_time,
        end_time=end_time,
        location_from=location_from,
        location_to=location_to,
        confirmation_number=confirmation_number,
        carrier=carrier,
        details=details,
        cost=cost,
        currency=currency,
    )
    db.add(segment)
    await db.commit()
    await db.refresh(segment)
    return _serialize_segment(segment)


async def delete_segment(db: AsyncSession, user: User, trip_id: str, segment_id: str) -> dict:
    """Delete a segment from a trip."""
    # Verify ownership via trip
    result = await db.execute(
        select(TripSegment)
        .join(Trip)
        .where(TripSegment.id == segment_id, Trip.id == trip_id, Trip.user_id == user.id)
    )
    segment = result.scalar_one_or_none()
    if not segment:
        raise TravelServiceError("Segment not found")

    await db.delete(segment)
    await db.commit()
    return {"status": "deleted"}


# --- Documents ---

async def add_document(
    db: AsyncSession,
    user: User,
    trip_id: str,
    name: str,
    doc_type: str = "other",
    file_url: str = "",
    notes: str = "",
) -> dict:
    """Add a document reference to a trip."""
    result = await db.execute(
        select(Trip).where(Trip.id == trip_id, Trip.user_id == user.id)
    )
    trip = result.scalar_one_or_none()
    if not trip:
        raise TravelServiceError("Trip not found")

    doc = TripDocument(
        trip_id=trip_id,
        name=name,
        doc_type=doc_type,
        file_url=file_url,
        notes=notes,
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return _serialize_document(doc)


async def delete_document(db: AsyncSession, user: User, trip_id: str, doc_id: str) -> dict:
    """Delete a document from a trip."""
    result = await db.execute(
        select(TripDocument)
        .join(Trip)
        .where(TripDocument.id == doc_id, Trip.id == trip_id, Trip.user_id == user.id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise TravelServiceError("Document not found")

    await db.delete(doc)
    await db.commit()
    return {"status": "deleted"}


# --- Calendar blocking ---

async def block_calendar_for_trip(
    db: AsyncSession, user: User, trip_id: str, provider: str
) -> dict:
    """Create an all-day calendar event blocking time for a trip."""
    trip_data = await get_trip(db, user, trip_id)

    try:
        event = await create_event(
            db, user, provider,
            title=f"🧳 Travel: {trip_data['title']}",
            start=trip_data["start_date"],
            end=trip_data["end_date"],
            description=f"Travel to {trip_data['destination']}\n\n{trip_data.get('notes', '')}",
            location=trip_data["destination"],
        )

        # Mark trip as calendar-blocked
        result = await db.execute(
            select(Trip).where(Trip.id == trip_id, Trip.user_id == user.id)
        )
        trip = result.scalar_one_or_none()
        if trip:
            trip.calendar_blocked = True
            await db.commit()

        return {"status": "blocked", "event": event}
    except CalendarServiceError as e:
        raise TravelServiceError(f"Failed to block calendar: {str(e)}")


# --- Conflict detection ---

async def check_travel_conflicts(
    db: AsyncSession, user: User, trip_id: str
) -> dict:
    """Check if a trip conflicts with existing calendar events."""
    trip_data = await get_trip(db, user, trip_id)

    events_result = await get_events(
        db, user,
        start_date=trip_data["start_date"],
        end_date=trip_data["end_date"],
    )

    conflicting_events = [
        e for e in events_result.get("events", [])
        if not e.get("is_all_day")  # Skip all-day events
    ]

    return {
        "trip": {"id": trip_data["id"], "title": trip_data["title"]},
        "conflicting_events": conflicting_events,
        "total_conflicts": len(conflicting_events),
    }


# --- AI assistance ---

async def ai_travel_summary(trip_data: dict) -> str:
    """Generate an AI summary/checklist for a trip."""
    client = get_anthropic_client()

    segments_text = ""
    for seg in trip_data.get("segments", []):
        segments_text += f"\n- {seg['segment_type'].upper()}: {seg['title']} ({seg['start_time']} → {seg['end_time']})"
        if seg.get("carrier"):
            segments_text += f" via {seg['carrier']}"
        if seg.get("confirmation_number"):
            segments_text += f" [Conf: {seg['confirmation_number']}]"

    prompt = f"""Create a concise travel summary and preparation checklist for the Chairman's upcoming trip.

Trip: {trip_data['title']}
Destination: {trip_data['destination']}
Dates: {trip_data['start_date']} to {trip_data['end_date']}
Segments: {segments_text or 'No segments added yet'}
Notes: {trip_data.get('notes', 'None')}

Provide:
1. A brief trip overview (2-3 sentences)
2. Key travel details at a glance
3. A preparation checklist (5-8 items)
4. Any time zone or scheduling notes"""

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=800,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    return response.content[0].text


# --- Email travel scanning ---

TRAVEL_SEARCH_QUERY = "flight OR hotel OR booking OR reservation OR itinerary OR confirmation OR boarding pass OR travel OR trip"


async def scan_emails_for_travel(
    db: AsyncSession,
    user: User,
    query: str = "",
    page_size: int = 30,
) -> dict:
    """Scan recent emails for travel content and return suggestions."""
    from app.services.email_service import get_inbox

    # Try travel-specific search first
    search_query = query or TRAVEL_SEARCH_QUERY
    inbox = await get_inbox(db, user, query=search_query, page_size=page_size)
    emails = inbox.get("emails", [])

    # Fallback: if travel search found nothing, scan all recent emails
    if not emails and not query:
        inbox = await get_inbox(db, user, page_size=page_size)
        emails = inbox.get("emails", [])

    if not emails:
        return {"suggestions": [], "emails_scanned": 0, "travel_found": 0}

    # Run AI extraction in parallel with concurrency limit
    semaphore = asyncio.Semaphore(5)

    async def _extract(email: dict) -> dict | None:
        async with semaphore:
            try:
                return await extract_travel_from_email(
                    from_addr=email.get("from", ""),
                    subject=email.get("subject", ""),
                    body=(email.get("body") or email.get("snippet", ""))[:3000],
                    email_id=email.get("id", ""),
                    provider=email.get("provider", ""),
                )
            except Exception:
                return None

    results = await asyncio.gather(*[_extract(e) for e in emails])

    suggestions = []
    for i, result in enumerate(results):
        if result is None:
            continue

        # Add email date for display
        result["email_date"] = emails[i].get("date", "")

        # Deduplicate against existing trips
        match = await _find_matching_trip(db, user, result)
        if match:
            result["action_type"] = "add_to_existing"
            result["existing_trip_id"] = match["id"]
            result["existing_trip_title"] = match["title"]
        else:
            result.setdefault("action_type", "new_trip")
            result["existing_trip_id"] = None
            result["existing_trip_title"] = None

        suggestions.append(result)

    return {
        "suggestions": suggestions,
        "emails_scanned": len(emails),
        "travel_found": len(suggestions),
    }


async def _find_matching_trip(
    db: AsyncSession, user: User, suggestion: dict
) -> dict | None:
    """Check if a suggestion matches an existing trip by confirmation number or date+destination."""
    # 1. Match by confirmation number
    suggestion_conf_numbers = [
        seg.get("confirmation_number", "").strip()
        for seg in suggestion.get("segments", [])
        if seg.get("confirmation_number", "").strip()
    ]

    if suggestion_conf_numbers:
        result = await db.execute(
            select(Trip)
            .join(TripSegment)
            .where(
                Trip.user_id == user.id,
                TripSegment.confirmation_number.in_(suggestion_conf_numbers),
            )
            .options(selectinload(Trip.segments), selectinload(Trip.documents))
        )
        trip = result.scalar_one_or_none()
        if trip:
            return _serialize_trip(trip)

    # 2. Match by date range + destination overlap
    dest = suggestion.get("destination", "").lower()
    start = suggestion.get("start_date", "")
    end = suggestion.get("end_date", "")

    if dest and start and end:
        result = await db.execute(
            select(Trip)
            .where(
                Trip.user_id == user.id,
                Trip.status.in_(["upcoming", "in_progress"]),
            )
            .options(selectinload(Trip.segments), selectinload(Trip.documents))
        )
        trips = result.scalars().all()
        for trip in trips:
            # Check destination similarity (substring match)
            trip_dest = (trip.destination or "").lower()
            if dest in trip_dest or trip_dest in dest:
                # Check date overlap
                if trip.start_date and trip.end_date:
                    if start <= trip.end_date and end >= trip.start_date:
                        return _serialize_trip(trip)

    return None


async def approve_travel_suggestion(
    db: AsyncSession,
    user: User,
    suggestion: dict,
) -> dict:
    """Create or update a trip from an approved travel suggestion."""
    action = suggestion.get("action_type", "new_trip")

    if action == "add_to_existing" and suggestion.get("existing_trip_id"):
        trip_id = suggestion["existing_trip_id"]
        # Verify trip exists
        trip_data = await get_trip(db, user, trip_id)
    else:
        # Create new trip
        trip_data = await create_trip(
            db, user,
            title=suggestion.get("trip_title", "Untitled Trip"),
            destination=suggestion.get("destination", ""),
            start_date=suggestion.get("start_date", ""),
            end_date=suggestion.get("end_date", ""),
            notes=suggestion.get("notes", ""),
        )
        trip_id = trip_data["id"]

    # Add segments, skipping duplicates by confirmation number
    existing_conf_numbers = {
        seg["confirmation_number"]
        for seg in trip_data.get("segments", [])
        if seg.get("confirmation_number")
    }

    for seg in suggestion.get("segments", []):
        conf = seg.get("confirmation_number", "").strip()
        if conf and conf in existing_conf_numbers:
            continue  # Skip duplicate

        await add_segment(
            db, user, trip_id,
            segment_type=seg.get("segment_type", "other"),
            title=seg.get("title", ""),
            start_time=seg.get("start_time", ""),
            end_time=seg.get("end_time", ""),
            location_from=seg.get("location_from", ""),
            location_to=seg.get("location_to", ""),
            confirmation_number=conf,
            carrier=seg.get("carrier", ""),
            cost=seg.get("cost"),
            currency=seg.get("currency", "USD"),
        )

    # Return the full updated trip
    return await get_trip(db, user, trip_id)


# --- Serializers ---

def _serialize_trip(trip: Trip) -> dict:
    return {
        "id": trip.id,
        "title": trip.title,
        "destination": trip.destination,
        "start_date": trip.start_date,
        "end_date": trip.end_date,
        "status": trip.status,
        "notes": trip.notes,
        "calendar_blocked": trip.calendar_blocked,
        "segments": [_serialize_segment(s) for s in (trip.segments or [])],
        "documents": [_serialize_document(d) for d in (trip.documents or [])],
        "created_at": trip.created_at.isoformat() if trip.created_at else None,
    }


def _serialize_segment(segment: TripSegment) -> dict:
    return {
        "id": segment.id,
        "trip_id": segment.trip_id,
        "segment_type": segment.segment_type,
        "title": segment.title,
        "start_time": segment.start_time,
        "end_time": segment.end_time,
        "location_from": segment.location_from,
        "location_to": segment.location_to,
        "confirmation_number": segment.confirmation_number,
        "carrier": segment.carrier,
        "details": segment.details,
        "cost": segment.cost,
        "currency": segment.currency,
    }


def _serialize_document(doc: TripDocument) -> dict:
    return {
        "id": doc.id,
        "trip_id": doc.trip_id,
        "name": doc.name,
        "doc_type": doc.doc_type,
        "file_url": doc.file_url,
        "notes": doc.notes,
        "created_at": doc.created_at.isoformat() if doc.created_at else None,
    }
