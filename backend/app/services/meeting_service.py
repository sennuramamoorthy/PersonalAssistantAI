"""Meeting service — AI-powered meeting management, briefings, and scheduling."""

from app.integrations.anthropic_client import get_anthropic_client

MEETING_SYSTEM_PROMPT = """You are an AI executive assistant for a Chairman who oversees multiple colleges and a university.
You help manage meetings efficiently. Be concise, professional, and action-oriented."""


async def ai_recommend_response(
    title: str,
    organizer: str,
    description: str,
    attendees: list[dict],
    start: str,
    end: str,
    existing_events: list[dict] | None = None,
) -> dict:
    """AI recommends whether to accept, decline, or tentatively accept a meeting."""
    client = get_anthropic_client()

    conflicts_text = ""
    if existing_events:
        conflict_list = [
            f"- {e['title']} ({e['start']} to {e['end']})"
            for e in existing_events
        ]
        if conflict_list:
            conflicts_text = f"\n\nExisting events during this time:\n" + "\n".join(conflict_list)

    attendee_text = ", ".join(
        f"{a.get('name', a.get('email', 'Unknown'))}" for a in (attendees or [])[:10]
    )

    prompt = f"""Analyze this meeting invitation and recommend whether the Chairman should accept, decline, or tentatively accept it.

Meeting: {title}
Organizer: {organizer}
Time: {start} to {end}
Attendees: {attendee_text or 'Not specified'}
Description: {description[:1500] if description else 'No description provided'}{conflicts_text}

Return a JSON object with:
- recommendation: "accept", "decline", or "tentative"
- reason: A brief 1-2 sentence explanation
- priority: "high", "normal", or "low"
- suggested_action: What the Chairman should do (e.g., "Accept and prepare budget overview", "Decline - conflicts with Board meeting")"""

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=400,
        system=MEETING_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    import json
    text = response.content[0].text
    try:
        if "```json" in text:
            json_str = text.split("```json")[1].split("```")[0].strip()
        elif "{" in text:
            start_idx = text.index("{")
            end_idx = text.rindex("}") + 1
            json_str = text[start_idx:end_idx]
        else:
            json_str = text
        return json.loads(json_str)
    except (json.JSONDecodeError, ValueError):
        return {
            "recommendation": "tentative",
            "reason": "Unable to analyze this meeting. Review manually.",
            "priority": "normal",
            "suggested_action": "Review the meeting details and decide.",
        }


async def ai_generate_briefing(
    title: str,
    organizer: str,
    description: str,
    attendees: list[dict],
    related_emails: list[dict] | None = None,
) -> str:
    """Generate pre-meeting briefing notes."""
    client = get_anthropic_client()

    attendee_text = "\n".join(
        f"- {a.get('name', 'Unknown')} ({a.get('email', '')})"
        for a in (attendees or [])[:15]
    )

    email_context = ""
    if related_emails:
        email_summaries = "\n".join(
            f"- From {e.get('from', 'Unknown')}: {e.get('subject', '')} — {e.get('snippet', '')[:200]}"
            for e in related_emails[:5]
        )
        email_context = f"\n\nRecent related emails:\n{email_summaries}"

    prompt = f"""Generate concise pre-meeting briefing notes for the Chairman.

Meeting: {title}
Organizer: {organizer}
Description: {description[:2000] if description else 'No description provided'}

Attendees:
{attendee_text or 'Not specified'}{email_context}

Create a brief that includes:
1. Meeting Purpose (1-2 sentences)
2. Key Attendees & their roles (if identifiable)
3. Talking Points / Agenda items
4. Recommended preparation steps
5. Potential decisions to be made

Keep it concise and actionable."""

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=800,
        system=MEETING_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    return response.content[0].text


async def ai_suggest_meeting_times(
    title: str,
    duration_minutes: int,
    attendees: list[str],
    existing_events: list[dict],
    preferred_hours: tuple[int, int] = (9, 17),
    days_ahead: int = 5,
) -> str:
    """AI suggests optimal meeting times based on existing schedule."""
    client = get_anthropic_client()

    events_text = "\n".join(
        f"- {e['title']}: {e['start']} to {e['end']}"
        for e in existing_events[:30]
    )

    prompt = f"""Suggest 3 optimal time slots for a new meeting.

New Meeting: {title}
Duration: {duration_minutes} minutes
Attendees to invite: {', '.join(attendees)}
Preferred hours: {preferred_hours[0]}:00 to {preferred_hours[1]}:00
Look ahead: {days_ahead} days

Chairman's existing schedule:
{events_text or 'No existing events'}

Suggest 3 time slots that:
1. Don't conflict with existing events
2. Are within preferred hours
3. Allow buffer time between meetings (at least 15 minutes)
4. Prioritize morning slots for important meetings

Format each suggestion with date, time, and brief rationale."""

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=500,
        system=MEETING_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    return response.content[0].text


async def ai_draft_meeting_agenda(
    title: str,
    description: str,
    attendees: list[dict],
    duration_minutes: int = 60,
) -> str:
    """AI generates a meeting agenda."""
    client = get_anthropic_client()

    attendee_text = ", ".join(
        a.get("name", a.get("email", "Unknown")) for a in (attendees or [])[:10]
    )

    prompt = f"""Draft a professional meeting agenda for the Chairman.

Meeting: {title}
Duration: {duration_minutes} minutes
Attendees: {attendee_text or 'TBD'}
Context: {description[:1500] if description else 'No additional context'}

Create a structured agenda with:
- Welcome / Opening (with time allocation)
- Discussion items (numbered, with time allocations)
- Action items review
- Next steps / Closing

Keep it professional and time-aware. Total should fit within {duration_minutes} minutes."""

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=600,
        system=MEETING_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    return response.content[0].text
