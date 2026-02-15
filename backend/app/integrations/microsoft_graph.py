"""Microsoft Graph API integration for Outlook Mail."""

from typing import Any

import httpx

from app.core.config import settings

MICROSOFT_AUTH_URL = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize"
MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"
GRAPH_API_BASE = "https://graph.microsoft.com/v1.0"

MICROSOFT_SCOPES = [
    "Mail.Read",
    "Mail.Send",
    "Mail.ReadWrite",
    "Calendars.Read",
    "Calendars.ReadWrite",
    "User.Read",
    "offline_access",
]


def get_microsoft_auth_url(redirect_uri: str, state: str) -> str:
    """Generate Microsoft OAuth2 authorization URL."""
    tenant = settings.microsoft_tenant_id or "common"
    params = {
        "client_id": settings.microsoft_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(MICROSOFT_SCOPES),
        "state": state,
        "response_mode": "query",
    }
    query = "&".join(f"{k}={httpx.URL('', params={k: v}).params[k]}" for k, v in params.items())
    return MICROSOFT_AUTH_URL.format(tenant=tenant) + f"?{query}"


async def exchange_microsoft_code(code: str, redirect_uri: str) -> dict:
    """Exchange authorization code for tokens."""
    tenant = settings.microsoft_tenant_id or "common"
    async with httpx.AsyncClient() as client:
        response = await client.post(
            MICROSOFT_TOKEN_URL.format(tenant=tenant),
            data={
                "client_id": settings.microsoft_client_id,
                "client_secret": settings.microsoft_client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
                "scope": " ".join(MICROSOFT_SCOPES),
            },
        )
        response.raise_for_status()
        return response.json()


async def refresh_microsoft_token(refresh_token: str) -> dict:
    """Refresh an expired access token."""
    tenant = settings.microsoft_tenant_id or "common"
    async with httpx.AsyncClient() as client:
        response = await client.post(
            MICROSOFT_TOKEN_URL.format(tenant=tenant),
            data={
                "client_id": settings.microsoft_client_id,
                "client_secret": settings.microsoft_client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
                "scope": " ".join(MICROSOFT_SCOPES),
            },
        )
        response.raise_for_status()
        return response.json()


class OutlookClient:
    """Client for interacting with Microsoft Graph Mail API."""

    def __init__(self, access_token: str):
        self.access_token = access_token
        self.headers = {"Authorization": f"Bearer {access_token}"}

    async def _request(self, method: str, path: str, **kwargs) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.request(
                method,
                f"{GRAPH_API_BASE}{path}",
                headers=self.headers,
                **kwargs,
            )
            response.raise_for_status()
            if response.status_code == 204:
                return {}
            return response.json()

    async def list_messages(
        self,
        folder: str = "inbox",
        top: int = 20,
        skip: int = 0,
        filter_query: str | None = None,
        search: str | None = None,
    ) -> dict:
        """List messages from a mail folder."""
        params: dict[str, Any] = {
            "$top": top,
            "$skip": skip,
            "$orderby": "receivedDateTime desc",
            "$select": "id,subject,from,toRecipients,receivedDateTime,isRead,bodyPreview,body,conversationId,flag",
        }
        if filter_query:
            params["$filter"] = filter_query
        if search:
            params["$search"] = f'"{search}"'

        return await self._request("GET", f"/me/mailFolders/{folder}/messages", params=params)

    async def get_message(self, message_id: str) -> dict:
        """Get a single message by ID."""
        return await self._request("GET", f"/me/messages/{message_id}")

    async def send_message(self, to: str, subject: str, body: str, reply_to_message_id: str | None = None) -> dict:
        """Send an email or reply to an existing message."""
        if reply_to_message_id:
            payload = {
                "comment": body,
            }
            return await self._request(
                "POST", f"/me/messages/{reply_to_message_id}/reply", json=payload
            )

        payload = {
            "message": {
                "subject": subject,
                "body": {"contentType": "Text", "content": body},
                "toRecipients": [{"emailAddress": {"address": to}}],
            }
        }
        return await self._request("POST", "/me/sendMail", json=payload)

    async def mark_as_read(self, message_id: str) -> dict:
        """Mark a message as read."""
        return await self._request(
            "PATCH", f"/me/messages/{message_id}", json={"isRead": True}
        )

    async def archive(self, message_id: str) -> dict:
        """Move message to archive folder."""
        return await self._request(
            "POST",
            f"/me/messages/{message_id}/move",
            json={"destinationId": "archive"},
        )

    async def get_profile(self) -> dict:
        """Get the user's profile."""
        return await self._request("GET", "/me")


def parse_outlook_message(raw_message: dict) -> dict:
    """Parse a raw Graph API message into a clean dict."""
    from_data = raw_message.get("from", {}).get("emailAddress", {})
    to_list = raw_message.get("toRecipients", [])
    to_addresses = ", ".join(
        r.get("emailAddress", {}).get("address", "") for r in to_list
    )
    body_content = raw_message.get("body", {}).get("content", "")

    return {
        "id": raw_message["id"],
        "thread_id": raw_message.get("conversationId", ""),
        "provider": "microsoft",
        "from": f"{from_data.get('name', '')} <{from_data.get('address', '')}>",
        "to": to_addresses,
        "subject": raw_message.get("subject", "(no subject)"),
        "snippet": raw_message.get("bodyPreview", ""),
        "body": body_content,
        "date": raw_message.get("receivedDateTime", ""),
        "is_unread": not raw_message.get("isRead", True),
        "is_starred": raw_message.get("flag", {}).get("flagStatus") == "flagged",
        "labels": [],
    }
