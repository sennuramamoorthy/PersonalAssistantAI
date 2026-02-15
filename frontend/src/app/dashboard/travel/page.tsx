"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Plane,
  Plus,
  MapPin,
  Calendar,
  ChevronRight,
  Loader2,
  Trash2,
  AlertTriangle,
  FileText,
  Hotel,
  Car,
  Train,
  Sparkles,
  CalendarCheck,
  X,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";
import type { Trip, TripsResponse, TripSegment } from "@/types/travel";

const SEGMENT_ICONS: Record<string, typeof Plane> = {
  flight: Plane,
  hotel: Hotel,
  car_rental: Car,
  train: Train,
  other: MapPin,
};

const STATUS_STYLES: Record<string, string> = {
  upcoming: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  in_progress: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  completed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  cancelled: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300",
};

export default function TravelPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showSegmentForm, setShowSegmentForm] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [conflicts, setConflicts] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create form state
  const [newTrip, setNewTrip] = useState({
    title: "",
    destination: "",
    start_date: "",
    end_date: "",
    notes: "",
  });

  // Segment form state
  const [newSegment, setNewSegment] = useState({
    segment_type: "flight",
    title: "",
    start_time: "",
    end_time: "",
    location_from: "",
    location_to: "",
    confirmation_number: "",
    carrier: "",
    cost: "",
    currency: "USD",
  });

  const fetchTrips = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const params = filter !== "all" ? `?status=${filter}` : "";
      const data = await apiFetch<TripsResponse>(`/api/travel/trips${params}`, {
        token: accessToken,
      });
      setTrips(data.trips);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [accessToken, filter]);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  async function handleCreateTrip(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken) return;
    setActionLoading("create");
    try {
      const created = await apiFetch<Trip>("/api/travel/trips", {
        method: "POST",
        token: accessToken,
        body: JSON.stringify(newTrip),
      });
      setTrips((prev) => [created, ...prev]);
      setShowCreateForm(false);
      setNewTrip({ title: "", destination: "", start_date: "", end_date: "", notes: "" });
      setSelectedTrip(created);
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeleteTrip(tripId: string) {
    if (!accessToken) return;
    setActionLoading("delete");
    try {
      await apiFetch(`/api/travel/trips/${tripId}`, {
        method: "DELETE",
        token: accessToken,
      });
      setTrips((prev) => prev.filter((t) => t.id !== tripId));
      if (selectedTrip?.id === tripId) setSelectedTrip(null);
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  async function handleAddSegment(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !selectedTrip) return;
    setActionLoading("segment");
    try {
      const seg = await apiFetch<TripSegment>(
        `/api/travel/trips/${selectedTrip.id}/segments`,
        {
          method: "POST",
          token: accessToken,
          body: JSON.stringify({
            ...newSegment,
            cost: newSegment.cost ? parseFloat(newSegment.cost) : null,
          }),
        }
      );
      setSelectedTrip((prev) =>
        prev ? { ...prev, segments: [...prev.segments, seg] } : prev
      );
      setTrips((prev) =>
        prev.map((t) =>
          t.id === selectedTrip.id
            ? { ...t, segments: [...t.segments, seg] }
            : t
        )
      );
      setShowSegmentForm(false);
      setNewSegment({
        segment_type: "flight",
        title: "",
        start_time: "",
        end_time: "",
        location_from: "",
        location_to: "",
        confirmation_number: "",
        carrier: "",
        cost: "",
        currency: "USD",
      });
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeleteSegment(segmentId: string) {
    if (!accessToken || !selectedTrip) return;
    try {
      await apiFetch(
        `/api/travel/trips/${selectedTrip.id}/segments/${segmentId}`,
        { method: "DELETE", token: accessToken }
      );
      setSelectedTrip((prev) =>
        prev
          ? { ...prev, segments: prev.segments.filter((s) => s.id !== segmentId) }
          : prev
      );
      setTrips((prev) =>
        prev.map((t) =>
          t.id === selectedTrip.id
            ? { ...t, segments: t.segments.filter((s) => s.id !== segmentId) }
            : t
        )
      );
    } catch {
      // ignore
    }
  }

  async function handleAiSummary() {
    if (!accessToken || !selectedTrip) return;
    setAiLoading(true);
    setAiSummary(null);
    try {
      const data = await apiFetch<{ summary: string }>(
        `/api/travel/trips/${selectedTrip.id}/summary`,
        { token: accessToken }
      );
      setAiSummary(data.summary);
    } catch {
      setAiSummary("Failed to generate summary.");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleCheckConflicts() {
    if (!accessToken || !selectedTrip) return;
    setActionLoading("conflicts");
    try {
      const data = await apiFetch<{ total_conflicts: number }>(
        `/api/travel/trips/${selectedTrip.id}/conflicts`,
        { token: accessToken }
      );
      setConflicts(data.total_conflicts);
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  async function handleBlockCalendar(provider: "google" | "microsoft") {
    if (!accessToken || !selectedTrip) return;
    setActionLoading("block");
    try {
      await apiFetch(`/api/travel/trips/${selectedTrip.id}/block-calendar`, {
        method: "POST",
        token: accessToken,
        body: JSON.stringify({ provider }),
      });
      setSelectedTrip((prev) => (prev ? { ...prev, calendar_blocked: true } : prev));
      setTrips((prev) =>
        prev.map((t) =>
          t.id === selectedTrip?.id ? { ...t, calendar_blocked: true } : t
        )
      );
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  function formatDate(dateStr: string) {
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  }

  function formatDateTime(dtStr: string) {
    try {
      return new Date(dtStr).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return dtStr;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Travel</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Manage your travel itineraries and documents
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          New Trip
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {["all", "upcoming", "in_progress", "completed", "cancelled"].map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setSelectedTrip(null); }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === f
                ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                : "text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
            }`}
          >
            {f === "all" ? "All" : f === "in_progress" ? "In Progress" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Trip List */}
        <div className="lg:col-span-1 space-y-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--muted-foreground)]" />
            </div>
          ) : trips.length === 0 ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-8 text-center shadow-sm">
              <Plane className="h-10 w-10 mx-auto text-[var(--muted-foreground)]" />
              <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                No trips found. Create your first trip!
              </p>
            </div>
          ) : (
            trips.map((trip) => (
              <button
                key={trip.id}
                onClick={() => { setSelectedTrip(trip); setAiSummary(null); setConflicts(null); }}
                className={`w-full rounded-xl border p-4 text-left transition-colors shadow-sm ${
                  selectedTrip?.id === trip.id
                    ? "border-[var(--primary)] bg-[var(--accent)]"
                    : "border-[var(--border)] bg-[var(--background)] hover:bg-[var(--accent)]"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-[var(--foreground)] truncate">
                      {trip.title}
                    </h3>
                    <div className="mt-1 flex items-center gap-1 text-sm text-[var(--muted-foreground)]">
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{trip.destination}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                      <Calendar className="h-3 w-3 flex-shrink-0" />
                      {formatDate(trip.start_date)} — {formatDate(trip.end_date)}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[trip.status] || ""}`}>
                        {trip.status === "in_progress" ? "In Progress" : trip.status.charAt(0).toUpperCase() + trip.status.slice(1)}
                      </span>
                      {trip.segments.length > 0 && (
                        <span className="text-xs text-[var(--muted-foreground)]">
                          {trip.segments.length} segment{trip.segments.length !== 1 ? "s" : ""}
                        </span>
                      )}
                      {trip.calendar_blocked && (
                        <CalendarCheck className="h-3.5 w-3.5 text-green-500" />
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 flex-shrink-0 text-[var(--muted-foreground)]" />
                </div>
              </button>
            ))
          )}
        </div>

        {/* Trip Detail */}
        <div className="lg:col-span-2">
          {selectedTrip ? (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-sm">
              {/* Trip Header */}
              <div className="border-b border-[var(--border)] p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-[var(--foreground)]">
                      {selectedTrip.title}
                    </h2>
                    <div className="mt-1 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                      <MapPin className="h-4 w-4" />
                      {selectedTrip.destination}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                      <Calendar className="h-4 w-4" />
                      {formatDate(selectedTrip.start_date)} — {formatDate(selectedTrip.end_date)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_STYLES[selectedTrip.status] || ""}`}>
                      {selectedTrip.status === "in_progress" ? "In Progress" : selectedTrip.status.charAt(0).toUpperCase() + selectedTrip.status.slice(1)}
                    </span>
                    <button
                      onClick={() => handleDeleteTrip(selectedTrip.id)}
                      disabled={actionLoading === "delete"}
                      className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      title="Delete trip"
                    >
                      {actionLoading === "delete" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {selectedTrip.notes && (
                  <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                    {selectedTrip.notes}
                  </p>
                )}

                {/* Action buttons */}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={handleAiSummary}
                    disabled={aiLoading}
                    className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 transition-colors disabled:opacity-50"
                  >
                    {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    AI Summary
                  </button>
                  <button
                    onClick={handleCheckConflicts}
                    disabled={actionLoading === "conflicts"}
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors disabled:opacity-50"
                  >
                    {actionLoading === "conflicts" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                    Check Conflicts
                  </button>
                  {!selectedTrip.calendar_blocked && (
                    <>
                      <button
                        onClick={() => handleBlockCalendar("google")}
                        disabled={actionLoading === "block"}
                        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors disabled:opacity-50"
                      >
                        {actionLoading === "block" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarCheck className="h-3.5 w-3.5" />}
                        Block Google Cal
                      </button>
                      <button
                        onClick={() => handleBlockCalendar("microsoft")}
                        disabled={actionLoading === "block"}
                        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors disabled:opacity-50"
                      >
                        {actionLoading === "block" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarCheck className="h-3.5 w-3.5" />}
                        Block Outlook Cal
                      </button>
                    </>
                  )}
                  {selectedTrip.calendar_blocked && (
                    <span className="flex items-center gap-1 text-xs text-green-600">
                      <CalendarCheck className="h-3.5 w-3.5" />
                      Calendar blocked
                    </span>
                  )}
                </div>

                {/* Conflict result */}
                {conflicts !== null && (
                  <div className={`mt-3 rounded-lg p-3 text-sm ${
                    conflicts > 0
                      ? "bg-yellow-50 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300"
                      : "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300"
                  }`}>
                    {conflicts > 0
                      ? `${conflicts} calendar conflict${conflicts !== 1 ? "s" : ""} found during this trip.`
                      : "No calendar conflicts during this trip."}
                  </div>
                )}
              </div>

              {/* AI Summary */}
              {aiSummary && (
                <div className="border-b border-[var(--border)] p-6">
                  <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-500" />
                    AI Travel Summary
                  </h3>
                  <div className="mt-2 text-sm text-[var(--muted-foreground)] whitespace-pre-wrap">
                    {aiSummary}
                  </div>
                </div>
              )}

              {/* Segments */}
              <div className="border-b border-[var(--border)] p-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">
                    Itinerary ({selectedTrip.segments.length} segments)
                  </h3>
                  <button
                    onClick={() => setShowSegmentForm(true)}
                    className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Segment
                  </button>
                </div>

                {selectedTrip.segments.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                    No segments added yet. Add flights, hotels, or transport to build your itinerary.
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {selectedTrip.segments.map((seg) => {
                      const Icon = SEGMENT_ICONS[seg.segment_type] || MapPin;
                      return (
                        <div
                          key={seg.id}
                          className="flex items-start gap-3 rounded-lg border border-[var(--border)] p-3"
                        >
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]">
                            <Icon className="h-4 w-4 text-[var(--foreground)]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-sm text-[var(--foreground)]">
                                {seg.title}
                              </p>
                              <button
                                onClick={() => handleDeleteSegment(seg.id)}
                                className="text-[var(--muted-foreground)] hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <p className="text-xs text-[var(--muted-foreground)]">
                              {formatDateTime(seg.start_time)} → {formatDateTime(seg.end_time)}
                            </p>
                            {(seg.location_from || seg.location_to) && (
                              <p className="text-xs text-[var(--muted-foreground)]">
                                {seg.location_from}{seg.location_from && seg.location_to ? " → " : ""}{seg.location_to}
                              </p>
                            )}
                            <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--muted-foreground)]">
                              {seg.carrier && <span>{seg.carrier}</span>}
                              {seg.confirmation_number && (
                                <span className="font-mono">#{seg.confirmation_number}</span>
                              )}
                              {seg.cost != null && (
                                <span className="font-medium">
                                  {seg.currency} {seg.cost.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Documents */}
              <div className="p-6">
                <h3 className="text-sm font-semibold text-[var(--foreground)]">
                  Documents ({selectedTrip.documents.length})
                </h3>
                {selectedTrip.documents.length === 0 ? (
                  <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                    No documents attached.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {selectedTrip.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center gap-2 rounded-lg border border-[var(--border)] p-2 text-sm"
                      >
                        <FileText className="h-4 w-4 text-[var(--muted-foreground)]" />
                        <span className="text-[var(--foreground)]">{doc.name}</span>
                        <span className="text-xs text-[var(--muted-foreground)]">
                          ({doc.doc_type.replace("_", " ")})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-12 text-center shadow-sm">
              <Plane className="h-12 w-12 mx-auto text-[var(--muted-foreground)]" />
              <h2 className="mt-4 text-lg font-semibold text-[var(--foreground)]">
                Select a trip
              </h2>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                Choose a trip from the list or create a new one to get started.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Create Trip Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-[var(--background)] p-6 shadow-xl border border-[var(--border)]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">New Trip</h3>
              <button onClick={() => setShowCreateForm(false)} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateTrip} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={newTrip.title}
                  onChange={(e) => setNewTrip({ ...newTrip, title: e.target.value })}
                  placeholder="e.g. Board Meeting — Delhi"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Destination</label>
                <input
                  type="text"
                  required
                  value={newTrip.destination}
                  onChange={(e) => setNewTrip({ ...newTrip, destination: e.target.value })}
                  placeholder="e.g. New Delhi, India"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={newTrip.start_date}
                    onChange={(e) => setNewTrip({ ...newTrip, start_date: e.target.value })}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1">End Date</label>
                  <input
                    type="date"
                    required
                    value={newTrip.end_date}
                    onChange={(e) => setNewTrip({ ...newTrip, end_date: e.target.value })}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Notes</label>
                <textarea
                  value={newTrip.notes}
                  onChange={(e) => setNewTrip({ ...newTrip, notes: e.target.value })}
                  rows={3}
                  placeholder="Any additional notes..."
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--accent)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === "create"}
                  className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  {actionLoading === "create" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create Trip
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Segment Modal */}
      {showSegmentForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-[var(--background)] p-6 shadow-xl border border-[var(--border)] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">Add Segment</h3>
              <button onClick={() => setShowSegmentForm(false)} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAddSegment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Type</label>
                <select
                  value={newSegment.segment_type}
                  onChange={(e) => setNewSegment({ ...newSegment, segment_type: e.target.value })}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                >
                  <option value="flight">Flight</option>
                  <option value="hotel">Hotel</option>
                  <option value="car_rental">Car Rental</option>
                  <option value="train">Train</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={newSegment.title}
                  onChange={(e) => setNewSegment({ ...newSegment, title: e.target.value })}
                  placeholder="e.g. AI 302 DEL→BOM"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Start</label>
                  <input
                    type="datetime-local"
                    required
                    value={newSegment.start_time}
                    onChange={(e) => setNewSegment({ ...newSegment, start_time: e.target.value })}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1">End</label>
                  <input
                    type="datetime-local"
                    required
                    value={newSegment.end_time}
                    onChange={(e) => setNewSegment({ ...newSegment, end_time: e.target.value })}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1">From</label>
                  <input
                    type="text"
                    value={newSegment.location_from}
                    onChange={(e) => setNewSegment({ ...newSegment, location_from: e.target.value })}
                    placeholder="Departure"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1">To</label>
                  <input
                    type="text"
                    value={newSegment.location_to}
                    onChange={(e) => setNewSegment({ ...newSegment, location_to: e.target.value })}
                    placeholder="Arrival"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Carrier</label>
                  <input
                    type="text"
                    value={newSegment.carrier}
                    onChange={(e) => setNewSegment({ ...newSegment, carrier: e.target.value })}
                    placeholder="e.g. Air India"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Confirmation #</label>
                  <input
                    type="text"
                    value={newSegment.confirmation_number}
                    onChange={(e) => setNewSegment({ ...newSegment, confirmation_number: e.target.value })}
                    placeholder="Booking ref"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Cost</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newSegment.cost}
                    onChange={(e) => setNewSegment({ ...newSegment, cost: e.target.value })}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1">Currency</label>
                  <select
                    value={newSegment.currency}
                    onChange={(e) => setNewSegment({ ...newSegment, currency: e.target.value })}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                    <option value="USD">USD</option>
                    <option value="INR">INR</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSegmentForm(false)}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--accent)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === "segment"}
                  className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  {actionLoading === "segment" && <Loader2 className="h-4 w-4 animate-spin" />}
                  Add Segment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
