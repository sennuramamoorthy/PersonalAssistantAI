"""Chat service — conversation management and AI streaming responses."""

import json
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func
from sqlalchemy.orm import selectinload

from app.models.conversation import Conversation, Message
from app.models.user import User
from app.models.travel import Trip
from app.core.database import async_session
from app.integrations.anthropic_client import get_anthropic_client, SYSTEM_PROMPT, CHAT_SYSTEM_PROMPT
from app.services.email_service import get_inbox
from app.services.calendar_service import get_events, detect_conflicts


class ChatServiceError(Exception):
    pass


# --- Conversation CRUD ---

async def create_conversation(db: AsyncSession, user_id: str) -> dict:
    """Create a new conversation."""
    conv = Conversation(user_id=user_id)
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    return _serialize_conversation(conv)


async def list_conversations(db: AsyncSession, user_id: str) -> list[dict]:
    """List conversations ordered by most recent activity."""
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == user_id, Conversation.is_archived == False)
        .order_by(Conversation.updated_at.desc())
        .limit(50)
    )
    conversations = result.scalars().all()
    return [_serialize_conversation(c) for c in conversations]


async def get_conversation(db: AsyncSession, conversation_id: str, user_id: str) -> dict:
    """Get a single conversation with ownership check."""
    conv = await _get_conversation_or_raise(db, conversation_id, user_id)
    return _serialize_conversation(conv)


async def update_conversation_title(
    db: AsyncSession, conversation_id: str, user_id: str, title: str
) -> dict:
    """Update a conversation's title."""
    conv = await _get_conversation_or_raise(db, conversation_id, user_id)
    conv.title = title
    await db.commit()
    await db.refresh(conv)
    return _serialize_conversation(conv)


async def delete_conversation(db: AsyncSession, conversation_id: str, user_id: str) -> dict:
    """Delete a conversation and all its messages."""
    conv = await _get_conversation_or_raise(db, conversation_id, user_id)
    await db.delete(conv)
    await db.commit()
    return {"deleted": True, "id": conversation_id}


# --- Messages ---

async def get_messages(
    db: AsyncSession, conversation_id: str, user_id: str, limit: int = 50
) -> list[dict]:
    """Get messages for a conversation."""
    await _get_conversation_or_raise(db, conversation_id, user_id)
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
        .limit(limit)
    )
    messages = result.scalars().all()
    return [_serialize_message(m) for m in messages]


async def save_user_message(db: AsyncSession, conversation_id: str, content: str) -> Message:
    """Save a user message and update conversation metadata."""
    msg = Message(
        conversation_id=conversation_id,
        role="user",
        content=content,
    )
    db.add(msg)

    # Update conversation
    await db.execute(
        update(Conversation)
        .where(Conversation.id == conversation_id)
        .values(
            message_count=Conversation.message_count + 1,
            updated_at=datetime.now(timezone.utc),
        )
    )
    await db.commit()
    await db.refresh(msg)
    return msg


async def get_recent_messages(db: AsyncSession, conversation_id: str, limit: int = 20) -> list[dict]:
    """Get the most recent messages for AI context window."""
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    messages = result.scalars().all()
    # Reverse to chronological order
    return [{"role": m.role, "content": m.content} for m in reversed(messages)]


# --- Context Gathering ---

async def gather_user_context(db: AsyncSession, user: User) -> str:
    """Gather live context from email, calendar, and travel for the AI assistant.

    Returns a context string to append to the system prompt so the AI
    has real-time awareness of the user's data.
    """
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_end = (now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)).isoformat()
    week_end = (now + timedelta(days=7)).isoformat()

    context_parts: list[str] = []
    context_parts.append(f"Current date/time: {now.strftime('%A, %B %d, %Y at %H:%M UTC')}")

    # --- Recent emails ---
    all_emails = []
    try:
        inbox = await get_inbox(db, user, page_size=15)
        all_emails = inbox.get("emails", [])
        unread = [e for e in all_emails if e.get("is_unread")]
        if unread:
            email_lines = [
                f"  - From: {e.get('from', '?')} | Subject: {e.get('subject', '?')} | Snippet: {e.get('snippet', '')[:120]}"
                for e in unread[:8]
            ]
            context_parts.append(
                f"UNREAD EMAILS ({len(unread)} total, showing top {min(len(unread), 8)}):\n" + "\n".join(email_lines)
            )
        else:
            context_parts.append("EMAILS: No unread emails.")

        # Also show recent read emails for context
        recent_read = [e for e in all_emails if not e.get("is_unread")][:5]
        if recent_read:
            read_lines = [
                f"  - From: {e.get('from', '?')} | Subject: {e.get('subject', '?')}"
                for e in recent_read
            ]
            context_parts.append(
                f"RECENT EMAILS (already read, for reference):\n" + "\n".join(read_lines)
            )
    except Exception:
        context_parts.append("EMAILS: Unable to fetch email data.")

    # --- Today's calendar ---
    today_events_list = []
    try:
        today_events = await get_events(db, user, start_date=today_start, end_date=today_end)
        today_events_list = today_events.get("events", [])
        if today_events_list:
            event_lines = [
                f"  - {e.get('start', '?')[:16]} - {e.get('end', '?')[:16]} | {e.get('title', 'Untitled')}"
                + (f" | Location: {e.get('location')}" if e.get('location') else "")
                + (f" | Meeting URL: {e.get('meeting_url')}" if e.get('meeting_url') else "")
                + (f" | Attendees: {', '.join(a.get('email', '') for a in e.get('attendees', [])[:5])}" if e.get('attendees') else "")
                for e in today_events_list
            ]
            context_parts.append(
                f"TODAY'S CALENDAR ({len(today_events_list)} events):\n" + "\n".join(event_lines)
            )
        else:
            context_parts.append("TODAY'S CALENDAR: No events scheduled for today.")
    except Exception:
        context_parts.append("CALENDAR: Unable to fetch calendar data.")

    # --- This week's calendar ---
    week_events_list = []
    try:
        week_events = await get_events(db, user, start_date=today_end, end_date=week_end)
        week_events_list = week_events.get("events", [])
        if week_events_list:
            event_lines = [
                f"  - {e.get('start', '?')[:16]} | {e.get('title', 'Untitled')}"
                + (f" | Location: {e.get('location')}" if e.get('location') else "")
                for e in week_events_list[:10]
            ]
            context_parts.append(
                f"UPCOMING THIS WEEK ({len(week_events_list)} events, showing up to 10):\n" + "\n".join(event_lines)
            )
    except Exception:
        pass

    # --- Scheduling conflicts ---
    try:
        all_events = today_events_list + week_events_list
        conflicts = detect_conflicts(all_events)
        if conflicts:
            conflict_lines = [
                f"  - CONFLICT: \"{c['event_1']['title']}\" ({c['event_1']['start'][:16]}) overlaps with \"{c['event_2']['title']}\" ({c['event_2']['start'][:16]})"
                for c in conflicts
            ]
            context_parts.append(
                f"SCHEDULING CONFLICTS ({len(conflicts)}):\n" + "\n".join(conflict_lines)
            )
    except Exception:
        pass

    # --- Pending meeting invites ---
    try:
        all_events = today_events_list + week_events_list
        pending_invites = [
            e for e in all_events
            if e.get("response_status") == "needsAction" and e.get("attendees")
        ]
        if pending_invites:
            invite_lines = [
                f"  - {e.get('start', '?')[:16]} | {e.get('title', 'Untitled')} | Organizer: {e.get('organizer', '?')}"
                for e in pending_invites
            ]
            context_parts.append(
                f"PENDING MEETING INVITES ({len(pending_invites)} awaiting response):\n" + "\n".join(invite_lines)
            )
    except Exception:
        pass

    # --- Upcoming trips ---
    try:
        result = await db.execute(
            select(Trip)
            .where(Trip.user_id == user.id, Trip.status.in_(["upcoming", "in_progress"]))
            .options(selectinload(Trip.segments))
            .order_by(Trip.start_date)
            .limit(5)
        )
        trips = result.scalars().all()
        if trips:
            trip_lines = []
            for t in trips:
                line = f"  - {t.title} | {t.destination} | {t.start_date} to {t.end_date} | Status: {t.status}"
                if t.segments:
                    seg_details = []
                    for s in t.segments[:5]:
                        seg = f"{s.segment_type}: {s.title}"
                        if s.carrier:
                            seg += f" ({s.carrier})"
                        if s.confirmation_number:
                            seg += f" [Conf: {s.confirmation_number}]"
                        if s.start_time:
                            seg += f" at {s.start_time[:16]}"
                        seg_details.append(seg)
                    line += f"\n    Segments: " + "; ".join(seg_details)
                if t.notes:
                    line += f"\n    Notes: {t.notes[:200]}"
                trip_lines.append(line)
            context_parts.append(
                f"UPCOMING TRIPS ({len(trips)}):\n" + "\n".join(trip_lines)
            )
        else:
            context_parts.append("TRIPS: No upcoming trips.")
    except Exception:
        context_parts.append("TRIPS: Unable to fetch travel data.")

    # --- Travel-related emails (may need action) ---
    try:
        travel_keywords = ["flight", "booking", "confirmation", "itinerary", "reservation", "hotel", "boarding", "travel"]
        travel_emails = [
            e for e in all_emails
            if e.get("is_unread") and any(
                kw in (e.get("subject", "") + " " + e.get("from", "")).lower()
                for kw in travel_keywords
            )
        ]
        if travel_emails:
            te_lines = [
                f"  - From: {e.get('from', '?')} | Subject: {e.get('subject', '?')}"
                for e in travel_emails[:5]
            ]
            context_parts.append(
                f"TRAVEL-RELATED EMAILS (may need action, {len(travel_emails)} found):\n" + "\n".join(te_lines)
            )
    except Exception:
        pass

    return "\n\n".join(context_parts)


def _build_enhanced_system_prompt(context: str) -> str:
    """Build an enhanced system prompt that includes live user context."""
    return f"""{CHAT_SYSTEM_PROMPT}

--- LIVE DATA (REFRESHED FOR THIS MESSAGE) ---

{context}"""


# --- AI Streaming ---

async def stream_ai_response(conversation_id: str, history: list[dict], system_prompt: str | None = None):
    """Async generator that streams AI response tokens as SSE events.

    Opens its own DB session to save the assistant response after streaming,
    since the caller's session may be closed by then (StreamingResponse).
    """
    client = get_anthropic_client()
    full_response = ""
    effective_prompt = system_prompt or SYSTEM_PROMPT

    try:
        async with client.messages.stream(
            model="claude-sonnet-4-20250514",
            max_tokens=2000,
            system=effective_prompt,
            messages=history,
        ) as stream:
            async for text in stream.text_stream:
                full_response += text
                event = json.dumps({"type": "delta", "content": text})
                yield f"data: {event}\n\n"
    except Exception as e:
        error_event = json.dumps({"type": "error", "content": str(e)})
        yield f"data: {error_event}\n\n"
        return

    # Save the full assistant response in a new DB session
    message_id = str(uuid.uuid4())
    try:
        async with async_session() as db:
            msg = Message(
                id=message_id,
                conversation_id=conversation_id,
                role="assistant",
                content=full_response,
            )
            db.add(msg)
            await db.execute(
                update(Conversation)
                .where(Conversation.id == conversation_id)
                .values(
                    message_count=Conversation.message_count + 1,
                    updated_at=datetime.now(timezone.utc),
                )
            )
            await db.commit()
    except Exception:
        pass  # Don't fail the stream if DB save fails

    done_event = json.dumps({"type": "done", "message_id": message_id})
    yield f"data: {done_event}\n\n"


async def generate_title_for_conversation(conversation_id: str, user_message: str):
    """Generate a title for the conversation based on the first user message.

    Runs in background — opens its own DB session.
    """
    client = get_anthropic_client()

    try:
        response = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=30,
            messages=[{
                "role": "user",
                "content": f"Generate a very short title (3-6 words, no quotes) for a conversation that starts with this message:\n\n{user_message[:500]}",
            }],
        )
        title = response.content[0].text.strip().strip('"\'')

        async with async_session() as db:
            await db.execute(
                update(Conversation)
                .where(Conversation.id == conversation_id)
                .values(title=title)
            )
            await db.commit()
    except Exception:
        pass  # Title generation is best-effort


# --- Helpers ---

async def _get_conversation_or_raise(
    db: AsyncSession, conversation_id: str, user_id: str
) -> Conversation:
    """Fetch a conversation with ownership check."""
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user_id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise ChatServiceError("Conversation not found")
    return conv


def _serialize_conversation(conv: Conversation) -> dict:
    return {
        "id": conv.id,
        "title": conv.title,
        "is_archived": conv.is_archived,
        "message_count": conv.message_count,
        "created_at": conv.created_at.isoformat() if conv.created_at else None,
        "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
    }


def _serialize_message(msg: Message) -> dict:
    return {
        "id": msg.id,
        "conversation_id": msg.conversation_id,
        "role": msg.role,
        "content": msg.content,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
    }
