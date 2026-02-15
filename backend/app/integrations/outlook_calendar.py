"""Microsoft Graph Calendar API integration."""

from typing import Any

import httpx

GRAPH_API_BASE = "https://graph.microsoft.com/v1.0"


class OutlookCalendarClient:
    """Client for interacting with Microsoft Graph Calendar API."""

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

    async def list_events(
        self,
        start_datetime: str | None = None,
        end_datetime: str | None = None,
        top: int = 50,
        skip: int = 0,
    ) -> dict:
        """List calendar events within a time range."""
        if start_datetime and end_datetime:
            # Use calendarView for date range queries
            params: dict[str, Any] = {
                "startDateTime": start_datetime,
                "endDateTime": end_datetime,
                "$top": top,
                "$skip": skip,
                "$orderby": "start/dateTime",
                "$select": "id,subject,body,start,end,location,organizer,attendees,isAllDay,isCancelled,responseStatus,onlineMeeting,webLink",
            }
            return await self._request("GET", "/me/calendarView", params=params)
        else:
            params = {
                "$top": top,
                "$skip": skip,
                "$orderby": "start/dateTime",
                "$select": "id,subject,body,start,end,location,organizer,attendees,isAllDay,isCancelled,responseStatus,onlineMeeting,webLink",
            }
            return await self._request("GET", "/me/events", params=params)

    async def get_event(self, event_id: str) -> dict:
        """Get a single event."""
        return await self._request("GET", f"/me/events/{event_id}")

    async def create_event(
        self,
        subject: str,
        start: str,
        end: str,
        body: str = "",
        location: str = "",
        attendees: list[str] | None = None,
        timezone: str = "UTC",
        is_online: bool = False,
    ) -> dict:
        """Create a new calendar event."""
        event_body: dict[str, Any] = {
            "subject": subject,
            "start": {"dateTime": start, "timeZone": timezone},
            "end": {"dateTime": end, "timeZone": timezone},
        }
        if body:
            event_body["body"] = {"contentType": "Text", "content": body}
        if location:
            event_body["location"] = {"displayName": location}
        if attendees:
            event_body["attendees"] = [
                {"emailAddress": {"address": a}, "type": "required"}
                for a in attendees
            ]
        if is_online:
            event_body["isOnlineMeeting"] = True
            event_body["onlineMeetingProvider"] = "teamsForBusiness"

        return await self._request("POST", "/me/events", json=event_body)

    async def update_event(self, event_id: str, updates: dict) -> dict:
        """Update an existing event."""
        return await self._request("PATCH", f"/me/events/{event_id}", json=updates)

    async def delete_event(self, event_id: str) -> dict:
        """Delete an event."""
        return await self._request("DELETE", f"/me/events/{event_id}")

    async def respond_to_event(
        self,
        event_id: str,
        response: str,
        comment: str = "",
    ) -> dict:
        """Respond to an event invitation (accept, decline, tentativelyAccept)."""
        body: dict[str, Any] = {"sendResponse": True}
        if comment:
            body["comment"] = comment

        return await self._request("POST", f"/me/events/{event_id}/{response}", json=body)


def parse_outlook_event(raw_event: dict) -> dict:
    """Parse a raw Graph Calendar event into a normalized dict."""
    start = raw_event.get("start", {})
    end = raw_event.get("end", {})
    organizer = raw_event.get("organizer", {}).get("emailAddress", {})
    attendees = raw_event.get("attendees", [])

    my_response = raw_event.get("responseStatus", {}).get("response", "none")

    # Map Microsoft response to normalized format
    response_map = {
        "organizer": "accepted",
        "accepted": "accepted",
        "declined": "declined",
        "tentativelyAccepted": "tentative",
        "none": "needsAction",
        "notResponded": "needsAction",
    }

    online_meeting = raw_event.get("onlineMeeting", {}) or {}
    meeting_link = online_meeting.get("joinUrl", "")

    return {
        "id": raw_event["id"],
        "provider": "microsoft",
        "title": raw_event.get("subject", "(No title)"),
        "description": raw_event.get("body", {}).get("content", ""),
        "location": raw_event.get("location", {}).get("displayName", ""),
        "start": start.get("dateTime", ""),
        "end": end.get("dateTime", ""),
        "timezone": start.get("timeZone", "UTC"),
        "is_all_day": raw_event.get("isAllDay", False),
        "status": "cancelled" if raw_event.get("isCancelled") else "confirmed",
        "organizer_name": organizer.get("name", ""),
        "organizer_email": organizer.get("address", ""),
        "is_organizer": organizer.get("address", "").lower() == raw_event.get("responseStatus", {}).get("response", "") == "organizer",
        "my_response": response_map.get(my_response, "needsAction"),
        "attendees": [
            {
                "email": a.get("emailAddress", {}).get("address", ""),
                "name": a.get("emailAddress", {}).get("name", ""),
                "response": response_map.get(
                    a.get("status", {}).get("response", "none"), "needsAction"
                ),
                "is_self": False,
            }
            for a in attendees
        ],
        "html_link": raw_event.get("webLink", ""),
        "meeting_link": meeting_link,
    }
