"""Claude AI integration for email analysis, categorization, and drafting."""

import json

import anthropic

from app.core.config import settings

_client: anthropic.AsyncAnthropic | None = None


def get_anthropic_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


SYSTEM_PROMPT = """You are an AI executive assistant for a Chairman who oversees multiple colleges and a university.
Your role is to help manage communications professionally and efficiently.

When analyzing emails:
- Classify the sender as one of: student, parent, faculty, vendor, board_member, government, unknown
- Assess priority as: urgent, high, normal, low
- Determine which institution the email relates to if possible
- Provide a concise summary (1-2 sentences)

When drafting responses:
- Match the formality level to the sender type (more formal for board members/government, warm but professional for parents/students)
- Be respectful and represent the Chairman's position appropriately
- Keep responses concise and action-oriented
- Never make commitments or promises the Chairman hasn't approved
- If the email requires a decision, suggest options rather than deciding"""


CHAT_SYSTEM_PROMPT = """You are the Chairman's dedicated Executive AI Assistant. The Chairman oversees multiple colleges and a university. You have direct, real-time access to the Chairman's email inbox, calendar, travel itineraries, and pending tasks.

YOUR ROLE & CAPABILITIES:
- You are a proactive, high-level executive assistant — not a generic chatbot
- You have LIVE ACCESS to the Chairman's email, calendar, meetings, and travel data (provided below)
- You can read, summarize, and analyze emails across Gmail and Outlook
- You can review today's schedule, upcoming meetings, and detect conflicts
- You can check travel plans, flight details, hotel bookings, and itineraries
- You can identify pending tasks, unanswered invites, and items needing attention

HOW TO BEHAVE:
- Be concise, direct, and professional — the Chairman is busy
- When asked about emails, calendar, travel, or tasks, ALWAYS reference the live data provided below — never say you don't have access
- Proactively highlight urgent items, conflicts, or things that need immediate attention
- When summarizing emails, mention the sender, key point, and whether a response is needed
- For calendar queries, provide times, event names, locations, and attendee context
- For travel queries, provide full itinerary details — flights, hotels, confirmation numbers
- If you spot scheduling conflicts between meetings and travel, flag them immediately
- When the Chairman asks for help drafting a response, consider the sender type and adjust tone accordingly
- If something requires a decision, present options with your recommendation rather than deciding

SENDER AWARENESS:
- Students/Parents: warm, supportive, approachable tone
- Faculty: collegial, respectful of academic expertise
- Board Members: formal, strategic, governance-aware
- Government/Regulatory: precise, compliant, professional
- Vendors: business-like, firm but fair

PROACTIVE INTELLIGENCE:
- If you notice travel that conflicts with meetings, mention it
- If urgent emails are sitting unread, flag them
- If meeting invites are pending response, remind the Chairman
- If a trip is approaching and there are preparation items, highlight them
- Always think one step ahead — what does the Chairman need to know right now?

IMPORTANT: You have real-time data access. Never tell the Chairman you cannot access their email, calendar, or travel. The live data is provided in the context below."""


async def categorize_email(
    from_addr: str, subject: str, body: str
) -> dict:
    """Categorize an email and generate a summary."""
    client = get_anthropic_client()

    prompt = f"""Analyze this email and return a JSON object with these fields:
- sender_type: one of "student", "parent", "faculty", "vendor", "board_member", "government", "unknown"
- priority: one of "urgent", "high", "normal", "low"
- category: a short category like "complaint", "inquiry", "invitation", "report", "request", "notification", "follow_up"
- summary: a 1-2 sentence summary of the email
- requires_response: boolean, whether this email needs a reply
- institution: which college/university this relates to, or "general" if unclear

Email details:
From: {from_addr}
Subject: {subject}
Body:
{body[:3000]}"""

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=500,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    # Parse the response - extract JSON from the text
    text = response.content[0].text

    # Try to extract JSON from the response
    try:
        # Look for JSON block in the response
        if "```json" in text:
            json_str = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            json_str = text.split("```")[1].split("```")[0].strip()
        elif "{" in text:
            start = text.index("{")
            end = text.rindex("}") + 1
            json_str = text[start:end]
        else:
            json_str = text

        return json.loads(json_str)
    except (json.JSONDecodeError, ValueError):
        return {
            "sender_type": "unknown",
            "priority": "normal",
            "category": "uncategorized",
            "summary": "Unable to categorize this email.",
            "requires_response": True,
            "institution": "general",
        }


async def draft_reply(
    from_addr: str,
    subject: str,
    body: str,
    sender_type: str = "unknown",
    instruction: str = "",
) -> str:
    """Draft a reply to an email."""
    client = get_anthropic_client()

    extra = f"\n\nAdditional instruction from the Chairman: {instruction}" if instruction else ""

    prompt = f"""Draft a professional reply to this email on behalf of the Chairman.
The sender is classified as: {sender_type}

Original email:
From: {from_addr}
Subject: {subject}
Body:
{body[:3000]}{extra}

Write ONLY the reply body text. Do not include subject line, greetings preamble about "Here's a draft", or any meta-commentary. Start directly with the greeting (e.g., "Dear...")."""

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    return response.content[0].text


async def summarize_thread(messages: list[dict]) -> str:
    """Summarize an email thread."""
    client = get_anthropic_client()

    thread_text = "\n\n---\n\n".join(
        f"From: {m.get('from', 'Unknown')}\nDate: {m.get('date', '')}\n{m.get('body', '')[:1000]}"
        for m in messages
    )

    prompt = f"""Summarize this email thread concisely. Include:
- Key points discussed
- Any decisions made
- Outstanding action items
- Current status

Thread:
{thread_text[:5000]}"""

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=500,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    return response.content[0].text


def _parse_json_response(text: str) -> dict | None:
    """Extract JSON from an AI response, handling markdown code blocks."""
    try:
        if "```json" in text:
            json_str = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            json_str = text.split("```")[1].split("```")[0].strip()
        elif "{" in text:
            start = text.index("{")
            end = text.rindex("}") + 1
            json_str = text[start:end]
        else:
            json_str = text
        return json.loads(json_str)
    except (json.JSONDecodeError, ValueError, IndexError):
        return None


async def extract_travel_from_email(
    from_addr: str, subject: str, body: str, email_id: str, provider: str
) -> dict | None:
    """Extract travel information from an email using AI.

    Returns a structured travel suggestion dict if the email is travel-related,
    or None if it is not.
    """
    client = get_anthropic_client()

    prompt = f"""Analyze this email and determine if it contains travel-related information
(flight confirmation, hotel booking, car rental, train ticket, itinerary, boarding pass,
travel cancellation, or schedule change).

If the email is NOT travel-related, return exactly: {{"is_travel": false}}

If the email IS travel-related, return a JSON object with these fields:
- is_travel: true
- trip_title: a short descriptive title for the trip (e.g., "Business Trip to New Delhi")
- destination: the primary destination city/location
- start_date: trip start date in ISO format (YYYY-MM-DD)
- end_date: trip end date in ISO format (YYYY-MM-DD)
- segments: an array of travel segments, each with:
  - segment_type: one of "flight", "hotel", "car_rental", "train", "other"
  - title: short description (e.g., "AI 302 DEL→BOM" or "Marriott Hotel Mumbai")
  - start_time: ISO datetime (YYYY-MM-DDTHH:MM:SS) or empty string if unknown
  - end_time: ISO datetime or empty string if unknown
  - location_from: departure location or empty string
  - location_to: arrival location or empty string
  - confirmation_number: booking/PNR/confirmation number exactly as shown, or empty string
  - carrier: airline/hotel chain/rental company name, or empty string
  - cost: numeric cost or null if not mentioned
  - currency: currency code (e.g., "USD", "INR") or "USD" as default
- action_type: "new_trip" (for new bookings) or "update_trip" (for changes/cancellations)
- notes: any additional relevant details (cancellation info, special requests, etc.)

Email details:
From: {from_addr}
Subject: {subject}
Body:
{body[:3000]}

Return ONLY the JSON object, no other text."""

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=800,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )

    result = _parse_json_response(response.content[0].text)
    if not result or not result.get("is_travel"):
        return None

    # Attach email metadata for tracking
    result["email_id"] = email_id
    result["email_provider"] = provider
    result["email_from"] = from_addr
    result["email_subject"] = subject

    return result
