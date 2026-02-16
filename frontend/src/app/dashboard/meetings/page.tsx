"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Loader2,
  Clock,
  MapPin,
  Video,
  CheckCircle,
  XCircle,
  HelpCircle,
  FileText,
  Sparkles,
  Settings,
  Calendar,
  Plus,
  X,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";
import type { CalendarEvent, MeetingsResponse } from "@/types/calendar";

type Tab = "pending" | "confirmed" | "all";

interface ScheduleForm {
  title: string;
  provider: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  attendees: string[];
}

const emptyForm: ScheduleForm = {
  title: "",
  provider: "",
  date: "",
  startTime: "09:00",
  endTime: "10:00",
  location: "",
  description: "",
  attendees: [],
};

export default function MeetingsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);

  const [meetings, setMeetings] = useState<CalendarEvent[]>([]);
  const [pending, setPending] = useState<CalendarEvent[]>([]);
  const [confirmed, setConfirmed] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("pending");
  const [selectedMeeting, setSelectedMeeting] = useState<CalendarEvent | null>(null);

  // AI state
  const [aiLoading, setAiLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<Record<string, unknown> | null>(null);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [agenda, setAgenda] = useState<string | null>(null);

  // Schedule Meeting modal state
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>({ ...emptyForm });
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [attendeeInput, setAttendeeInput] = useState("");
  const [suggestedTimes, setSuggestedTimes] = useState<string | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const isConnected = user?.google_connected || user?.microsoft_connected;

  // Set default provider based on connected accounts
  useEffect(() => {
    if (user?.google_connected) {
      setScheduleForm((prev) => ({ ...prev, provider: prev.provider || "google" }));
    } else if (user?.microsoft_connected) {
      setScheduleForm((prev) => ({ ...prev, provider: prev.provider || "microsoft" }));
    }
  }, [user]);

  const fetchMeetings = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    try {
      const data = await apiFetch<MeetingsResponse>("/api/meetings/", {
        token: accessToken || undefined,
      });
      setMeetings(data.meetings);
      setPending(data.pending);
      setConfirmed(data.confirmed);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [isConnected, accessToken]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  function formatTime(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return dateStr;
    }
  }

  function formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  }

  function handleSelect(meeting: CalendarEvent) {
    setSelectedMeeting(meeting);
    setRecommendation(null);
    setBriefing(null);
    setAgenda(null);
  }

  async function handleRecommend() {
    if (!selectedMeeting) return;
    setAiLoading(true);
    try {
      const result = await apiFetch<Record<string, unknown>>("/api/meetings/recommend", {
        method: "POST",
        token: accessToken || undefined,
        body: JSON.stringify({
          title: selectedMeeting.title,
          organizer: selectedMeeting.organizer_email || selectedMeeting.organizer_name,
          description: selectedMeeting.description,
          attendees: selectedMeeting.attendees,
          start: selectedMeeting.start,
          end: selectedMeeting.end,
        }),
      });
      setRecommendation(result);
    } catch {
      // ignore
    } finally {
      setAiLoading(false);
    }
  }

  async function handleBriefing() {
    if (!selectedMeeting) return;
    setAiLoading(true);
    try {
      const result = await apiFetch<{ briefing: string }>("/api/meetings/briefing", {
        method: "POST",
        token: accessToken || undefined,
        body: JSON.stringify({
          title: selectedMeeting.title,
          organizer: selectedMeeting.organizer_email || selectedMeeting.organizer_name,
          description: selectedMeeting.description,
          attendees: selectedMeeting.attendees,
        }),
      });
      setBriefing(result.briefing);
    } catch {
      // ignore
    } finally {
      setAiLoading(false);
    }
  }

  async function handleAgenda() {
    if (!selectedMeeting) return;
    setAiLoading(true);
    try {
      const result = await apiFetch<{ agenda: string }>("/api/meetings/agenda", {
        method: "POST",
        token: accessToken || undefined,
        body: JSON.stringify({
          title: selectedMeeting.title,
          description: selectedMeeting.description,
          attendees: selectedMeeting.attendees,
          duration_minutes: 60,
        }),
      });
      setAgenda(result.agenda);
    } catch {
      // ignore
    } finally {
      setAiLoading(false);
    }
  }

  async function handleRespond(response: "accepted" | "declined" | "tentative") {
    if (!selectedMeeting) return;
    try {
      await apiFetch("/api/calendar/events/respond", {
        method: "POST",
        token: accessToken || undefined,
        body: JSON.stringify({
          provider: selectedMeeting.provider,
          event_id: selectedMeeting.id,
          response,
        }),
      });
      // Refresh meetings list
      await fetchMeetings();
      setSelectedMeeting(null);
    } catch {
      // ignore
    }
  }

  // --- Schedule Meeting functions ---

  function openScheduleModal() {
    const defaultProvider = user?.google_connected ? "google" : "microsoft";
    const today = new Date().toISOString().split("T")[0];
    setScheduleForm({ ...emptyForm, provider: defaultProvider, date: today });
    setAttendeeInput("");
    setScheduleError(null);
    setSuggestedTimes(null);
    setShowScheduleModal(true);
  }

  function closeScheduleModal() {
    setShowScheduleModal(false);
    setScheduleForm({ ...emptyForm });
    setAttendeeInput("");
    setScheduleError(null);
    setSuggestedTimes(null);
  }

  function handleAddAttendee() {
    const email = attendeeInput.trim().toLowerCase();
    if (!email) return;
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setScheduleError("Please enter a valid email address");
      return;
    }
    if (scheduleForm.attendees.includes(email)) {
      setScheduleError("This email is already added");
      return;
    }
    setScheduleForm((prev) => ({
      ...prev,
      attendees: [...prev.attendees, email],
    }));
    setAttendeeInput("");
    setScheduleError(null);
  }

  function handleRemoveAttendee(email: string) {
    setScheduleForm((prev) => ({
      ...prev,
      attendees: prev.attendees.filter((a) => a !== email),
    }));
  }

  function handleAttendeeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddAttendee();
    }
  }

  async function handleSuggestTimes() {
    if (!scheduleForm.title.trim()) {
      setScheduleError("Please enter a meeting title first");
      return;
    }
    setSuggestLoading(true);
    setScheduleError(null);
    try {
      const result = await apiFetch<{ suggestions: string }>("/api/meetings/suggest-times", {
        method: "POST",
        token: accessToken || undefined,
        body: JSON.stringify({
          title: scheduleForm.title,
          duration_minutes: calculateDuration(),
          attendees: scheduleForm.attendees,
          preferred_hours: [9, 17],
          days_ahead: 5,
        }),
      });
      setSuggestedTimes(result.suggestions);
    } catch {
      setScheduleError("Failed to get AI suggestions");
    } finally {
      setSuggestLoading(false);
    }
  }

  function calculateDuration(): number {
    if (!scheduleForm.startTime || !scheduleForm.endTime) return 60;
    const [sh, sm] = scheduleForm.startTime.split(":").map(Number);
    const [eh, em] = scheduleForm.endTime.split(":").map(Number);
    return Math.max(15, (eh * 60 + em) - (sh * 60 + sm));
  }

  async function handleScheduleSubmit() {
    // Validate
    if (!scheduleForm.title.trim()) {
      setScheduleError("Meeting title is required");
      return;
    }
    if (!scheduleForm.date) {
      setScheduleError("Date is required");
      return;
    }
    if (!scheduleForm.startTime || !scheduleForm.endTime) {
      setScheduleError("Start and end times are required");
      return;
    }
    if (scheduleForm.startTime >= scheduleForm.endTime) {
      setScheduleError("End time must be after start time");
      return;
    }
    if (scheduleForm.attendees.length === 0) {
      setScheduleError("Please add at least one attendee");
      return;
    }

    setScheduleLoading(true);
    setScheduleError(null);

    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const startISO = `${scheduleForm.date}T${scheduleForm.startTime}:00`;
      const endISO = `${scheduleForm.date}T${scheduleForm.endTime}:00`;

      await apiFetch("/api/calendar/events", {
        method: "POST",
        token: accessToken || undefined,
        body: JSON.stringify({
          provider: scheduleForm.provider,
          title: scheduleForm.title.trim(),
          start: startISO,
          end: endISO,
          description: scheduleForm.description.trim(),
          location: scheduleForm.location.trim(),
          attendees: scheduleForm.attendees,
          timezone: tz,
        }),
      });

      closeScheduleModal();
      await fetchMeetings();
    } catch (err) {
      setScheduleError(
        err instanceof Error ? err.message : "Failed to create meeting"
      );
    } finally {
      setScheduleLoading(false);
    }
  }

  const displayList = tab === "pending" ? pending : tab === "confirmed" ? confirmed : meetings;

  if (!isConnected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Meetings</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            AI-powered meeting management
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-12 shadow-sm text-center">
          <Users className="h-12 w-12 mx-auto text-[var(--muted-foreground)]" />
          <h2 className="mt-4 text-lg font-semibold text-[var(--foreground)]">
            Connect Your Calendar
          </h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)] max-w-md mx-auto">
            Connect your Google or Microsoft account to manage meetings with AI assistance.
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Meetings</h1>
          <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
            {pending.length > 0
              ? `${pending.length} pending invitation${pending.length > 1 ? "s" : ""}`
              : "No pending invitations"}
            {" · "}
            {confirmed.length} upcoming
          </p>
        </div>
        <button
          onClick={openScheduleModal}
          className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Schedule Meeting
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] p-1 w-fit">
        {([
          { key: "pending" as Tab, label: "Pending", count: pending.length },
          { key: "confirmed" as Tab, label: "Confirmed", count: confirmed.length },
          { key: "all" as Tab, label: "All", count: meetings.length },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t.key
                ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            )}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Meeting List + Detail */}
      <div className="flex gap-4 min-h-[calc(100vh-260px)]">
        {/* List */}
        <div className={cn(
          "rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-sm overflow-hidden",
          selectedMeeting ? "w-2/5 hidden md:block" : "w-full"
        )}>
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--muted-foreground)]" />
            </div>
          ) : displayList.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <Calendar className="h-10 w-10 text-[var(--muted-foreground)]" />
              <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                No {tab === "all" ? "" : tab} meetings
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {displayList.map((meeting) => (
                <button
                  key={`${meeting.provider}-${meeting.id}`}
                  onClick={() => handleSelect(meeting)}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-[var(--accent)] transition-colors",
                    selectedMeeting?.id === meeting.id && "bg-[var(--accent)]"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "mt-1 h-2 w-2 rounded-full flex-shrink-0",
                      meeting.my_response === "needsAction" ? "bg-blue-500" :
                      meeting.my_response === "accepted" ? "bg-green-500" :
                      meeting.my_response === "declined" ? "bg-red-500" : "bg-yellow-500"
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--foreground)] truncate">
                        {meeting.title}
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                        {formatDate(meeting.start)} · {formatTime(meeting.start)} – {formatTime(meeting.end)}
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                        {meeting.organizer_name || meeting.organizer_email}
                        {meeting.attendees.length > 0 && ` · ${meeting.attendees.length} attendees`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {meeting.meeting_link && <Video className="h-3.5 w-3.5 text-[var(--muted-foreground)]" />}
                      <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]">
                        {meeting.provider === "google" ? "GCal" : "Outlook"}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail */}
        {selectedMeeting && (
          <div className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-sm overflow-auto">
            <div className="p-5 space-y-5">
              <div className="flex items-start justify-between">
                <h2 className="text-lg font-semibold text-[var(--foreground)]">
                  {selectedMeeting.title}
                </h2>
                <button
                  onClick={() => setSelectedMeeting(null)}
                  className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                >
                  Close
                </button>
              </div>

              {/* Meeting Info */}
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                  <Clock className="h-4 w-4" />
                  {formatDate(selectedMeeting.start)} · {formatTime(selectedMeeting.start)} – {formatTime(selectedMeeting.end)}
                </div>
                {selectedMeeting.location && (
                  <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                    <MapPin className="h-4 w-4" />
                    {selectedMeeting.location}
                  </div>
                )}
                <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                  <Users className="h-4 w-4" />
                  {selectedMeeting.organizer_name || selectedMeeting.organizer_email} · {selectedMeeting.attendees.length} attendees
                </div>
                {selectedMeeting.meeting_link && (
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-[var(--muted-foreground)]" />
                    <a href={selectedMeeting.meeting_link} target="_blank" rel="noopener noreferrer" className="text-[var(--primary)] hover:underline text-sm">
                      Join meeting
                    </a>
                  </div>
                )}
              </div>

              {/* Response Actions (for pending invitations) */}
              {selectedMeeting.my_response === "needsAction" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRespond("accepted")}
                    className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700 transition-colors"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    Accept
                  </button>
                  <button
                    onClick={() => handleRespond("tentative")}
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--accent)] transition-colors"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                    Tentative
                  </button>
                  <button
                    onClick={() => handleRespond("declined")}
                    className="flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Decline
                  </button>
                </div>
              )}

              {/* AI Actions */}
              <div className="border-t border-[var(--border)] pt-4 space-y-4">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">
                  AI Assistant
                </h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleRecommend}
                    disabled={aiLoading}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm text-[var(--primary-foreground)] hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    AI Recommendation
                  </button>
                  <button
                    onClick={handleBriefing}
                    disabled={aiLoading}
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--accent)] transition-colors disabled:opacity-50"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Briefing Notes
                  </button>
                  <button
                    onClick={handleAgenda}
                    disabled={aiLoading}
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--accent)] transition-colors disabled:opacity-50"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Draft Agenda
                  </button>
                </div>

                {aiLoading && (
                  <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    AI is thinking...
                  </div>
                )}

                {/* AI Recommendation */}
                {recommendation && (
                  <div className="rounded-lg border border-[var(--border)] p-4 space-y-2">
                    <h4 className="text-sm font-medium text-[var(--foreground)]">AI Recommendation</h4>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-sm font-semibold capitalize",
                        recommendation.recommendation === "accept" ? "text-green-600" :
                        recommendation.recommendation === "decline" ? "text-red-600" : "text-yellow-600"
                      )}>
                        {String(recommendation.recommendation)}
                      </span>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        (Priority: {String(recommendation.priority)})
                      </span>
                    </div>
                    <p className="text-sm text-[var(--muted-foreground)]">{String(recommendation.reason)}</p>
                    {recommendation.suggested_action ? (
                      <p className="text-sm text-[var(--foreground)]">
                        <strong>Action:</strong> {String(recommendation.suggested_action)}
                      </p>
                    ) : null}
                  </div>
                )}

                {/* AI Briefing */}
                {briefing && (
                  <div className="rounded-lg border border-[var(--border)] p-4 space-y-2">
                    <h4 className="text-sm font-medium text-[var(--foreground)]">Pre-Meeting Briefing</h4>
                    <div className="text-sm text-[var(--muted-foreground)] whitespace-pre-wrap">
                      {briefing}
                    </div>
                  </div>
                )}

                {/* AI Agenda */}
                {agenda && (
                  <div className="rounded-lg border border-[var(--border)] p-4 space-y-2">
                    <h4 className="text-sm font-medium text-[var(--foreground)]">Draft Meeting Agenda</h4>
                    <div className="text-sm text-[var(--muted-foreground)] whitespace-pre-wrap">
                      {agenda}
                    </div>
                  </div>
                )}
              </div>

              {/* Attendees */}
              {selectedMeeting.attendees.length > 0 && (
                <div className="border-t border-[var(--border)] pt-4">
                  <h3 className="text-sm font-medium text-[var(--foreground)] mb-2">
                    Attendees ({selectedMeeting.attendees.length})
                  </h3>
                  <div className="space-y-1.5">
                    {selectedMeeting.attendees.map((a, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-[var(--foreground)] truncate">{a.name || a.email}</span>
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded capitalize flex-shrink-0",
                          a.response === "accepted" ? "text-green-600 bg-green-50 dark:bg-green-900/20" :
                          a.response === "declined" ? "text-red-600 bg-red-50 dark:bg-red-900/20" :
                          "text-[var(--muted-foreground)]"
                        )}>
                          {a.response === "needsAction" ? "pending" : a.response}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Schedule Meeting Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeScheduleModal}
          />

          {/* Modal */}
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-xl mx-4">
            <div className="p-6 space-y-5">
              {/* Modal Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[var(--foreground)]">
                  Schedule Meeting
                </h2>
                <button
                  onClick={closeScheduleModal}
                  className="p-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Error */}
              {scheduleError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-2.5">
                  <p className="text-sm text-red-600 dark:text-red-400">{scheduleError}</p>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                  Meeting Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={scheduleForm.title}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g., Board Review Meeting"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </div>

              {/* Provider */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                  Calendar
                </label>
                <select
                  value={scheduleForm.provider}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, provider: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                >
                  {user?.google_connected && <option value="google">Google Calendar</option>}
                  {user?.microsoft_connected && <option value="microsoft">Microsoft Outlook</option>}
                </select>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={scheduleForm.date}
                    onChange={(e) => setScheduleForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                    Start <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={scheduleForm.startTime}
                    onChange={(e) => setScheduleForm((f) => ({ ...f, startTime: e.target.value }))}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                    End <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="time"
                    value={scheduleForm.endTime}
                    onChange={(e) => setScheduleForm((f) => ({ ...f, endTime: e.target.value }))}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  />
                </div>
              </div>

              {/* AI Suggest Times */}
              <div>
                <button
                  onClick={handleSuggestTimes}
                  disabled={suggestLoading}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--accent)] transition-colors disabled:opacity-50"
                >
                  {suggestLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  AI Suggest Times
                </button>
                {suggestedTimes && (
                  <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-3">
                    <p className="text-xs font-medium text-[var(--foreground)] mb-1">AI Suggestions:</p>
                    <div className="text-xs text-[var(--muted-foreground)] whitespace-pre-wrap">
                      {suggestedTimes}
                    </div>
                  </div>
                )}
              </div>

              {/* Location */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                  Location
                </label>
                <input
                  type="text"
                  value={scheduleForm.location}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="e.g., Conference Room A or Meeting Link"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                  Description
                </label>
                <textarea
                  value={scheduleForm.description}
                  onChange={(e) => setScheduleForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Meeting agenda or notes..."
                  rows={3}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] resize-none"
                />
              </div>

              {/* Attendees */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                  Attendees <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={attendeeInput}
                    onChange={(e) => {
                      setAttendeeInput(e.target.value);
                      setScheduleError(null);
                    }}
                    onKeyDown={handleAttendeeKeyDown}
                    placeholder="Enter email and press Enter"
                    className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  />
                  <button
                    onClick={handleAddAttendee}
                    type="button"
                    className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--accent)] transition-colors"
                  >
                    Add
                  </button>
                </div>
                {/* Attendee Chips */}
                {scheduleForm.attendees.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {scheduleForm.attendees.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--primary)]/10 px-3 py-1 text-xs text-[var(--foreground)]"
                      >
                        {email}
                        <button
                          onClick={() => handleRemoveAttendee(email)}
                          className="ml-0.5 rounded-full p-0.5 hover:bg-[var(--muted)] transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2 border-t border-[var(--border)]">
                <button
                  onClick={closeScheduleModal}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-[var(--accent)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleScheduleSubmit}
                  disabled={scheduleLoading}
                  className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {scheduleLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Send Invite
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
