"""Google Calendar API integration using httpx."""

from typing import Any

import httpx

GCAL_API_BASE = "https://www.googleapis.com/calendar/v3"


class GoogleCalendarClient:
    """Client for interacting with Google Calendar API."""

    def __init__(self, access_token: str):
        self.access_token = access_token
        self.headers = {"Authorization": f"Bearer {access_token}"}

    async def _request(self, method: str, path: str, **kwargs) -> dict:
        async with httpx.AsyncClient() as client:
            response = await client.request(
                method,
                f"{GCAL_API_BASE}{path}",
                headers=self.headers,
                **kwargs,
            )
            response.raise_for_status()
            if response.status_code == 204:
                return {}
            return response.json()

    async def list_events(
        self,
        calendar_id: str = "primary",
        time_min: str | None = None,
        time_max: str | None = None,
        max_results: int = 50,
        page_token: str | None = None,
        single_events: bool = True,
    ) -> dict:
        """List calendar events within a time range."""
        params: dict[str, Any] = {
            "maxResults": max_results,
            "singleEvents": single_events,
            "orderBy": "startTime" if single_events else "updated",
        }
        if time_min:
            params["timeMin"] = time_min
        if time_max:
            params["timeMax"] = time_max
        if page_token:
            params["pageToken"] = page_token

        return await self._request("GET", f"/calendars/{calendar_id}/events", params=params)

    async def get_event(self, event_id: str, calendar_id: str = "primary") -> dict:
        """Get a single event."""
        return await self._request("GET", f"/calendars/{calendar_id}/events/{event_id}")

    async def create_event(
        self,
        summary: str,
        start: str,
        end: str,
        description: str = "",
        location: str = "",
        attendees: list[str] | None = None,
        calendar_id: str = "primary",
        timezone: str = "UTC",
    ) -> dict:
        """Create a new calendar event."""
        event_body: dict[str, Any] = {
            "summary": summary,
            "start": {"dateTime": start, "timeZone": timezone},
            "end": {"dateTime": end, "timeZone": timezone},
        }
        if description:
            event_body["description"] = description
        if location:
            event_body["location"] = location
        if attendees:
            event_body["attendees"] = [{"email": a} for a in attendees]

        return await self._request(
            "POST",
            f"/calendars/{calendar_id}/events",
            json=event_body,
            params={"sendUpdates": "all"},
        )

    async def update_event(
        self,
        event_id: str,
        updates: dict,
        calendar_id: str = "primary",
    ) -> dict:
        """Update an existing event."""
        return await self._request(
            "PATCH",
            f"/calendars/{calendar_id}/events/{event_id}",
            json=updates,
            params={"sendUpdates": "all"},
        )

    async def delete_event(self, event_id: str, calendar_id: str = "primary") -> dict:
        """Delete an event."""
        return await self._request(
            "DELETE", f"/calendars/{calendar_id}/events/{event_id}",
            params={"sendUpdates": "all"},
        )

    async def respond_to_event(
        self,
        event_id: str,
        response: str,
        calendar_id: str = "primary",
    ) -> dict:
        """Respond to an event invitation (accepted, declined, tentative)."""
        # Fetch event first to get current data
        event = await self.get_event(event_id, calendar_id)

        # Find self in attendees and update response
        attendees = event.get("attendees", [])
        for attendee in attendees:
            if attendee.get("self"):
                attendee["responseStatus"] = response
                break

        return await self._request(
            "PATCH",
            f"/calendars/{calendar_id}/events/{event_id}",
            json={"attendees": attendees},
            params={"sendUpdates": "all"},
        )

    async def list_calendars(self) -> dict:
        """List all calendars for the user."""
        return await self._request("GET", "/users/me/calendarList")


def parse_google_event(raw_event: dict) -> dict:
    """Parse a raw Google Calendar event into a normalized dict."""
    start = raw_event.get("start", {})
    end = raw_event.get("end", {})

    # Google uses dateTime for timed events, date for all-day
    start_dt = start.get("dateTime", start.get("date", ""))
    end_dt = end.get("dateTime", end.get("date", ""))
    is_all_day = "date" in start and "dateTime" not in start

    attendees = raw_event.get("attendees", [])
    my_status = "needsAction"
    for a in attendees:
        if a.get("self"):
            my_status = a.get("responseStatus", "needsAction")
            break

    organizer = raw_event.get("organizer", {})
    is_organizer = organizer.get("self", False)

    return {
        "id": raw_event["id"],
        "provider": "google",
        "title": raw_event.get("summary", "(No title)"),
        "description": raw_event.get("description", ""),
        "location": raw_event.get("location", ""),
        "start": start_dt,
        "end": end_dt,
        "timezone": start.get("timeZone", "UTC"),
        "is_all_day": is_all_day,
        "status": raw_event.get("status", "confirmed"),
        "organizer_name": organizer.get("displayName", organizer.get("email", "")),
        "organizer_email": organizer.get("email", ""),
        "is_organizer": is_organizer,
        "my_response": my_status,
        "attendees": [
            {
                "email": a.get("email", ""),
                "name": a.get("displayName", ""),
                "response": a.get("responseStatus", "needsAction"),
                "is_self": a.get("self", False),
            }
            for a in attendees
        ],
        "html_link": raw_event.get("htmlLink", ""),
        "meeting_link": raw_event.get("hangoutLink", ""),
    }
