"""Gmail API integration using httpx (no Google SDK dependency)."""

import base64
import json
from datetime import datetime, timezone
from email.mime.text import MIMEText
from typing import Any

import httpx

from app.core.config import settings

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1"

GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/userinfo.email",
]


def get_google_auth_url(redirect_uri: str, state: str) -> str:
    """Generate Google OAuth2 authorization URL."""
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(GOOGLE_SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    query = "&".join(f"{k}={httpx.URL('', params={k: v}).params[k]}" for k, v in params.items())
    return f"{GOOGLE_AUTH_URL}?{query}"


async def exchange_google_code(code: str, redirect_uri: str) -> dict:
    """Exchange authorization code for tokens."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            },
        )
        response.raise_for_status()
        return response.json()


async def refresh_google_token(refresh_token: str) -> dict:
    """Refresh an expired access token."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
        response.raise_for_status()
        return response.json()


class GmailClient:
    """Client for interacting with Gmail API."""

    def __init__(self, access_token: str):
        self.access_token = access_token
        self.headers = {"Authorization": f"Bearer {access_token}"}

    async def _request(self, method: str, path: str, **kwargs) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.request(
                method,
                f"{GMAIL_API_BASE}{path}",
                headers=self.headers,
                **kwargs,
            )
            if response.status_code >= 400:
                # Include Google's error details for better debugging
                try:
                    error_body = response.json()
                    error_msg = error_body.get("error", {}).get("message", response.text)
                except Exception:
                    error_msg = response.text
                raise httpx.HTTPStatusError(
                    f"Gmail API {response.status_code}: {error_msg}",
                    request=response.request,
                    response=response,
                )
            return response.json()

    async def list_messages(
        self,
        query: str = "",
        max_results: int = 20,
        page_token: str | None = None,
        label_ids: list[str] | None = None,
    ) -> dict:
        """List messages from Gmail inbox."""
        params: dict[str, Any] = {"maxResults": max_results}
        if query:
            params["q"] = query
        if page_token:
            params["pageToken"] = page_token
        if label_ids:
            params["labelIds"] = label_ids

        return await self._request("GET", "/users/me/messages", params=params)

    async def get_message(self, message_id: str, format: str = "full") -> dict:
        """Get a single message by ID."""
        return await self._request(
            "GET",
            f"/users/me/messages/{message_id}",
            params={"format": format},
        )

    async def get_thread(self, thread_id: str) -> dict:
        """Get a full email thread."""
        return await self._request("GET", f"/users/me/threads/{thread_id}")

    async def send_message(self, to: str, subject: str, body: str, reply_to_message_id: str | None = None) -> dict:
        """Send an email message."""
        message = MIMEText(body)
        message["to"] = to
        message["subject"] = subject

        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
        payload: dict[str, Any] = {"raw": raw}
        if reply_to_message_id:
            payload["threadId"] = reply_to_message_id

        return await self._request("POST", "/users/me/messages/send", json=payload)

    async def modify_message(self, message_id: str, add_labels: list[str] | None = None, remove_labels: list[str] | None = None) -> dict:
        """Modify labels on a message (archive, mark read, etc.)."""
        body: dict[str, list[str]] = {}
        if add_labels:
            body["addLabelIds"] = add_labels
        if remove_labels:
            body["removeLabelIds"] = remove_labels

        return await self._request(
            "POST", f"/users/me/messages/{message_id}/modify", json=body
        )

    async def mark_as_read(self, message_id: str) -> dict:
        return await self.modify_message(message_id, remove_labels=["UNREAD"])

    async def archive(self, message_id: str) -> dict:
        return await self.modify_message(message_id, remove_labels=["INBOX"])

    async def get_profile(self) -> dict:
        """Get the user's Gmail profile."""
        return await self._request("GET", "/users/me/profile")


def parse_gmail_message(raw_message: dict) -> dict:
    """Parse a raw Gmail API message into a clean dict."""
    headers = {h["name"].lower(): h["value"] for h in raw_message.get("payload", {}).get("headers", [])}

    # Extract body
    body = ""
    payload = raw_message.get("payload", {})
    if payload.get("body", {}).get("data"):
        body = base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8", errors="replace")
    elif payload.get("parts"):
        for part in payload["parts"]:
            if part.get("mimeType") == "text/plain" and part.get("body", {}).get("data"):
                body = base64.urlsafe_b64decode(part["body"]["data"]).decode("utf-8", errors="replace")
                break
            elif part.get("mimeType") == "text/html" and part.get("body", {}).get("data") and not body:
                body = base64.urlsafe_b64decode(part["body"]["data"]).decode("utf-8", errors="replace")

    label_ids = raw_message.get("labelIds", [])

    return {
        "id": raw_message["id"],
        "thread_id": raw_message.get("threadId", ""),
        "provider": "google",
        "from": headers.get("from", ""),
        "to": headers.get("to", ""),
        "subject": headers.get("subject", "(no subject)"),
        "snippet": raw_message.get("snippet", ""),
        "body": body,
        "date": headers.get("date", ""),
        "is_unread": "UNREAD" in label_ids,
        "is_starred": "STARRED" in label_ids,
        "labels": label_ids,
    }
