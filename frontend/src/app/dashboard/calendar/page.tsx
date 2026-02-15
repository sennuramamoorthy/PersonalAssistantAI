"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  Clock,
  Users,
  AlertTriangle,
  Settings,
  Plus,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";
import type { CalendarEvent, EventsResponse } from "@/types/calendar";

export default function CalendarPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<unknown[]>([]);

  // Week navigation
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const isConnected = user?.google_connected || user?.microsoft_connected;

  function getWeekDates(offset: number) {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - now.getDay() + 1 + offset * 7);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
  }

  const fetchEvents = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getWeekDates(weekOffset);
      const params = new URLSearchParams({
        start_date: start.toISOString(),
        end_date: end.toISOString(),
      });
      const data = await apiFetch<EventsResponse>(
        `/api/calendar/events?${params}`,
        { token: accessToken || undefined }
      );
      setEvents(data.events);

      // Also check conflicts
      const conflictData = await apiFetch<{ conflicts: unknown[]; total: number }>(
        `/api/calendar/conflicts?${params}`,
        { token: accessToken || undefined }
      );
      setConflicts(conflictData.conflicts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch events");
    } finally {
      setLoading(false);
    }
  }, [isConnected, weekOffset, accessToken]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  function formatTime(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return dateStr;
    }
  }

  function formatDateShort(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  }

  function getWeekLabel(): string {
    const { start, end } = getWeekDates(weekOffset);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return `${start.toLocaleDateString([], opts)} – ${end.toLocaleDateString([], opts)}, ${end.getFullYear()}`;
  }

  // Group events by day
  function groupByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
    const map = new Map<string, CalendarEvent[]>();
    const { start } = getWeekDates(weekOffset);

    for (let i = 0; i < 7; i++) {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      const key = day.toISOString().split("T")[0];
      map.set(key, []);
    }

    for (const event of events) {
      const key = event.start.split("T")[0];
      if (map.has(key)) {
        map.get(key)!.push(event);
      }
    }

    return map;
  }

  const responseColors: Record<string, string> = {
    accepted: "text-green-600 bg-green-50 dark:bg-green-900/20",
    declined: "text-red-600 bg-red-50 dark:bg-red-900/20",
    tentative: "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20",
    needsAction: "text-blue-600 bg-blue-50 dark:bg-blue-900/20",
  };

  if (!isConnected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Calendar</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Unified calendar view across all your accounts
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-12 shadow-sm text-center">
          <Calendar className="h-12 w-12 mx-auto text-[var(--muted-foreground)]" />
          <h2 className="mt-4 text-lg font-semibold text-[var(--foreground)]">
            Connect Your Calendar
          </h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)] max-w-md mx-auto">
            Connect your Google or Microsoft account in Settings to view your unified calendar.
          </p>
          <button
            onClick={() => router.push("/dashboard/settings")}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity"
          >
            <Settings className="h-4 w-4" />
            Go to Settings
          </button>
        </div>
      </div>
    );
  }

  const dayGroups = groupByDay(events);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Calendar</h1>
          <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
            {events.length} events this week
            {conflicts.length > 0 && (
              <span className="text-yellow-600 ml-2">
                &middot; {conflicts.length} conflict{conflicts.length > 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Week Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            className="rounded-lg border border-[var(--border)] p-1.5 hover:bg-[var(--accent)] transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setWeekOffset(0)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--accent)] transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            className="rounded-lg border border-[var(--border)] p-1.5 hover:bg-[var(--accent)] transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="text-sm font-medium text-[var(--foreground)] ml-2">
            {getWeekLabel()}
          </span>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-[var(--muted-foreground)]" />}
      </div>

      {/* Conflicts Warning */}
      {conflicts.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>
            {conflicts.length} scheduling conflict{conflicts.length > 1 ? "s" : ""} detected this week.
          </span>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Week View + Detail Split */}
      <div className="flex gap-4">
        {/* Week Grid */}
        <div className={cn(
          "flex-1 space-y-2",
          selectedEvent && "hidden md:block md:w-3/5"
        )}>
          {Array.from(dayGroups.entries()).map(([dateKey, dayEvents]) => {
            const date = new Date(dateKey + "T12:00:00");
            const isToday = new Date().toISOString().split("T")[0] === dateKey;

            return (
              <div key={dateKey} className="rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-sm overflow-hidden">
                <div className={cn(
                  "px-4 py-2 border-b border-[var(--border)]",
                  isToday && "bg-[var(--primary)]/5"
                )}>
                  <span className={cn(
                    "text-sm font-medium",
                    isToday ? "text-[var(--primary)]" : "text-[var(--foreground)]"
                  )}>
                    {date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}
                    {isToday && <span className="ml-2 text-xs">(Today)</span>}
                  </span>
                </div>
                {dayEvents.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-[var(--muted-foreground)]">
                    No events
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border)]">
                    {dayEvents.map((event) => (
                      <button
                        key={`${event.provider}-${event.id}`}
                        onClick={() => setSelectedEvent(event)}
                        className={cn(
                          "w-full text-left px-4 py-2.5 hover:bg-[var(--accent)] transition-colors flex items-center gap-3",
                          selectedEvent?.id === event.id && "bg-[var(--accent)]"
                        )}
                      >
                        <div className={cn(
                          "w-1 h-8 rounded-full flex-shrink-0",
                          event.provider === "google" ? "bg-blue-500" : "bg-indigo-500"
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--foreground)] truncate">
                            {event.title}
                          </p>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            {event.is_all_day
                              ? "All day"
                              : `${formatTime(event.start)} – ${formatTime(event.end)}`}
                            {event.location && ` · ${event.location}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {event.attendees.length > 0 && (
                            <span className="text-xs text-[var(--muted-foreground)]">
                              <Users className="h-3 w-3 inline" /> {event.attendees.length}
                            </span>
                          )}
                          {event.meeting_link && (
                            <Video className="h-3 w-3 text-[var(--muted-foreground)]" />
                          )}
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium",
                            responseColors[event.my_response] || ""
                          )}>
                            {event.my_response === "needsAction" ? "Pending" : event.my_response}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Event Detail */}
        {selectedEvent && (
          <div className="w-full md:w-2/5 rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-sm overflow-auto">
            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between">
                <h2 className="text-lg font-semibold text-[var(--foreground)]">
                  {selectedEvent.title}
                </h2>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  Close
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                  <Clock className="h-4 w-4" />
                  {selectedEvent.is_all_day
                    ? `All day · ${formatDateShort(selectedEvent.start)}`
                    : `${formatDateShort(selectedEvent.start)} · ${formatTime(selectedEvent.start)} – ${formatTime(selectedEvent.end)}`}
                </div>

                {selectedEvent.location && (
                  <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                    <MapPin className="h-4 w-4" />
                    {selectedEvent.location}
                  </div>
                )}

                {selectedEvent.meeting_link && (
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-[var(--muted-foreground)]" />
                    <a
                      href={selectedEvent.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--primary)] hover:underline text-sm"
                    >
                      Join meeting
                    </a>
                  </div>
                )}

                <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                  <Calendar className="h-4 w-4" />
                  Organized by {selectedEvent.organizer_name || selectedEvent.organizer_email}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[var(--muted-foreground)]">Your status:</span>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded font-medium capitalize",
                    responseColors[selectedEvent.my_response] || ""
                  )}>
                    {selectedEvent.my_response === "needsAction" ? "Pending" : selectedEvent.my_response}
                  </span>
                </div>

                <span className="inline-block rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]">
                  {selectedEvent.provider === "google" ? "Google Calendar" : "Outlook Calendar"}
                </span>
              </div>

              {/* Attendees */}
              {selectedEvent.attendees.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-[var(--foreground)] mb-2">
                    Attendees ({selectedEvent.attendees.length})
                  </h3>
                  <div className="space-y-1.5">
                    {selectedEvent.attendees.slice(0, 10).map((a, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-[var(--foreground)] truncate">
                          {a.name || a.email}
                        </span>
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded capitalize flex-shrink-0",
                          responseColors[a.response] || "text-[var(--muted-foreground)]"
                        )}>
                          {a.response === "needsAction" ? "pending" : a.response}
                        </span>
                      </div>
                    ))}
                    {selectedEvent.attendees.length > 10 && (
                      <p className="text-xs text-[var(--muted-foreground)]">
                        +{selectedEvent.attendees.length - 10} more
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Description */}
              {selectedEvent.description && (
                <div>
                  <h3 className="text-sm font-medium text-[var(--foreground)] mb-1">
                    Description
                  </h3>
                  <p className="text-sm text-[var(--muted-foreground)] whitespace-pre-wrap line-clamp-6">
                    {selectedEvent.description.replace(/<[^>]*>/g, "")}
                  </p>
                </div>
              )}

              {/* Quick link */}
              {selectedEvent.html_link && (
                <a
                  href={selectedEvent.html_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-[var(--primary)] hover:underline"
                >
                  Open in {selectedEvent.provider === "google" ? "Google Calendar" : "Outlook"}
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
