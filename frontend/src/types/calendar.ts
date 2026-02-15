export interface CalendarEvent {
  id: string;
  provider: "google" | "microsoft";
  title: string;
  description: string;
  location: string;
  start: string;
  end: string;
  timezone: string;
  is_all_day: boolean;
  status: string;
  organizer_name: string;
  organizer_email: string;
  is_organizer: boolean;
  my_response: "accepted" | "declined" | "tentative" | "needsAction";
  attendees: Attendee[];
  html_link: string;
  meeting_link: string;
}

export interface Attendee {
  email: string;
  name: string;
  response: string;
  is_self: boolean;
}

export interface EventsResponse {
  events: CalendarEvent[];
  total: number;
  start_date: string;
  end_date: string;
  providers_connected: string[];
  errors?: string[];
}

export interface MeetingsResponse {
  meetings: CalendarEvent[];
  pending: CalendarEvent[];
  confirmed: CalendarEvent[];
  total: number;
  pending_count: number;
}
