"""Email service — orchestrates Gmail, Outlook, and AI for unified email management."""

from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.encryption import decrypt_token, encrypt_token
from app.models.oauth_token import OAuthToken
from app.models.user import User
from app.integrations.gmail import (
    GmailClient,
    parse_gmail_message,
    refresh_google_token,
)
from app.integrations.microsoft_graph import (
    OutlookClient,
    parse_outlook_message,
    refresh_microsoft_token,
)
from app.integrations.anthropic_client import categorize_email, draft_reply, enhance_message


class EmailServiceError(Exception):
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

    # Check if token is expired (with 5-minute buffer)
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
            from datetime import timedelta
            token_record.token_expiry = datetime.now(timezone.utc) + timedelta(
                seconds=new_tokens["expires_in"]
            )

        await db.commit()

    return access_token


async def get_inbox(
    db: AsyncSession,
    user: User,
    provider: str | None = None,
    query: str = "",
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """Fetch emails from connected accounts."""
    all_emails: list[dict] = []
    errors: list[str] = []

    providers_to_fetch = []
    if provider in (None, "google") and user.google_connected:
        providers_to_fetch.append("google")
    if provider in (None, "microsoft") and user.microsoft_connected:
        providers_to_fetch.append("microsoft")

    if not providers_to_fetch:
        return {
            "emails": [],
            "total": 0,
            "unread": 0,
            "page": page,
            "page_size": page_size,
            "providers_connected": [],
        }

    for prov in providers_to_fetch:
        try:
            token_record = await _get_oauth_token(db, user.id, prov)
            if not token_record:
                continue

            access_token = await _get_valid_access_token(db, token_record)

            if prov == "google":
                client = GmailClient(access_token)
                result = await client.list_messages(
                    query=query, max_results=page_size, label_ids=["INBOX"]
                )
                message_ids = [m["id"] for m in result.get("messages", [])]

                for msg_id in message_ids:
                    raw = await client.get_message(msg_id)
                    parsed = parse_gmail_message(raw)
                    all_emails.append(parsed)

            elif prov == "microsoft":
                client = OutlookClient(access_token)
                result = await client.list_messages(
                    top=page_size,
                    skip=(page - 1) * page_size,
                    search=query if query else None,
                )
                for raw_msg in result.get("value", []):
                    parsed = parse_outlook_message(raw_msg)
                    all_emails.append(parsed)

        except Exception as e:
            errors.append(f"{prov}: {str(e)}")

    # Sort by date descending
    all_emails.sort(key=lambda e: e.get("date", ""), reverse=True)

    unread_count = sum(1 for e in all_emails if e.get("is_unread"))

    return {
        "emails": all_emails[:page_size],
        "total": len(all_emails),
        "unread": unread_count,
        "page": page,
        "page_size": page_size,
        "providers_connected": providers_to_fetch,
        "errors": errors if errors else None,
    }


async def get_email_detail(
    db: AsyncSession, user: User, email_id: str, provider: str
) -> dict:
    """Fetch a single email with full body."""
    token_record = await _get_oauth_token(db, user.id, provider)
    if not token_record:
        raise EmailServiceError(f"{provider} account not connected")

    access_token = await _get_valid_access_token(db, token_record)

    if provider == "google":
        client = GmailClient(access_token)
        raw = await client.get_message(email_id)
        return parse_gmail_message(raw)
    else:
        client = OutlookClient(access_token)
        raw = await client.get_message(email_id)
        return parse_outlook_message(raw)


async def ai_categorize(
    from_addr: str, subject: str, body: str
) -> dict:
    """Use AI to categorize an email."""
    return await categorize_email(from_addr, subject, body)


async def ai_draft_response(
    from_addr: str,
    subject: str,
    body: str,
    sender_type: str = "unknown",
    instruction: str = "",
) -> str:
    """Use AI to draft a reply."""
    return await draft_reply(from_addr, subject, body, sender_type, instruction)


async def ai_enhance_message(
    text: str,
    subject: str = "",
    to: str = "",
    instruction: str = "",
) -> str:
    """Use AI to enhance/polish an email message."""
    return await enhance_message(text, subject, to, instruction)


async def send_reply(
    db: AsyncSession,
    user: User,
    provider: str,
    to: str,
    subject: str,
    body: str,
    reply_to_id: str | None = None,
) -> dict:
    """Send an email reply through the specified provider."""
    token_record = await _get_oauth_token(db, user.id, provider)
    if not token_record:
        raise EmailServiceError(f"{provider} account not connected")

    access_token = await _get_valid_access_token(db, token_record)

    if provider == "google":
        client = GmailClient(access_token)
        return await client.send_message(to, subject, body, reply_to_id)
    else:
        client = OutlookClient(access_token)
        return await client.send_message(to, subject, body, reply_to_id)


async def mark_as_read(
    db: AsyncSession, user: User, email_id: str, provider: str
) -> dict:
    """Mark an email as read."""
    token_record = await _get_oauth_token(db, user.id, provider)
    if not token_record:
        raise EmailServiceError(f"{provider} account not connected")

    access_token = await _get_valid_access_token(db, token_record)

    if provider == "google":
        client = GmailClient(access_token)
        return await client.mark_as_read(email_id)
    else:
        client = OutlookClient(access_token)
        return await client.mark_as_read(email_id)


async def archive_email(
    db: AsyncSession, user: User, email_id: str, provider: str
) -> dict:
    """Archive an email."""
    token_record = await _get_oauth_token(db, user.id, provider)
    if not token_record:
        raise EmailServiceError(f"{provider} account not connected")

    access_token = await _get_valid_access_token(db, token_record)

    if provider == "google":
        client = GmailClient(access_token)
        return await client.archive(email_id)
    else:
        client = OutlookClient(access_token)
        return await client.archive(email_id)
