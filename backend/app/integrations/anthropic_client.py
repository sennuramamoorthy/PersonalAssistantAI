"""Claude AI integration for email analysis, categorization, and drafting."""

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
    import json

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
