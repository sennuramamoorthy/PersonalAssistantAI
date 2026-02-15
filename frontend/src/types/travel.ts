export interface TripSegment {
  id: string;
  trip_id: string;
  segment_type: "flight" | "hotel" | "car_rental" | "train" | "other";
  title: string;
  start_time: string;
  end_time: string;
  location_from: string;
  location_to: string;
  confirmation_number: string;
  carrier: string;
  details: string;
  cost: number | null;
  currency: string;
}

export interface TripDocument {
  id: string;
  trip_id: string;
  name: string;
  doc_type: "boarding_pass" | "hotel_confirmation" | "visa" | "insurance" | "itinerary" | "other";
  file_url: string;
  notes: string;
  created_at: string;
}

export interface Trip {
  id: string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  status: "upcoming" | "in_progress" | "completed" | "cancelled";
  notes: string;
  calendar_blocked: boolean;
  segments: TripSegment[];
  documents: TripDocument[];
  created_at: string;
}

export interface TripsResponse {
  trips: Trip[];
  total: number;
}

export interface TravelConflicts {
  trip: { id: string; title: string };
  conflicting_events: Array<{
    id: string;
    title: string;
    start: string;
    end: string;
    provider: string;
  }>;
  total_conflicts: number;
}

export interface TravelSuggestionSegment {
  segment_type: "flight" | "hotel" | "car_rental" | "train" | "other";
  title: string;
  start_time: string;
  end_time: string;
  location_from: string;
  location_to: string;
  confirmation_number: string;
  carrier: string;
  cost: number | null;
  currency: string;
}

export interface TravelSuggestion {
  email_id: string;
  email_provider: string;
  email_subject: string;
  email_from: string;
  email_date: string;
  trip_title: string;
  destination: string;
  start_date: string;
  end_date: string;
  segments: TravelSuggestionSegment[];
  action_type: "new_trip" | "add_to_existing";
  existing_trip_id: string | null;
  existing_trip_title: string | null;
  notes: string;
}

export interface ScanEmailsResponse {
  suggestions: TravelSuggestion[];
  emails_scanned: number;
  travel_found: number;
}
