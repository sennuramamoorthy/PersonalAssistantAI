"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CheckSquare,
  Plus,
  Loader2,
  Mail,
  Sparkles,
  Trash2,
  ChevronRight,
  Clock,
  AlertTriangle,
  CheckCircle,
  Circle,
  X,
  Calendar,
  Edit3,
  Search,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";
import type {
  Task,
  TasksResponse,
  TaskSuggestion,
  ScanEmailsForTasksResponse,
} from "@/types/task";

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  normal: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  low: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

const STATUS_ICONS: Record<string, typeof Circle> = {
  pending: Circle,
  in_progress: Clock,
  completed: CheckCircle,
};

const PRIORITY_BORDER: Record<string, string> = {
  urgent: "border-l-red-500",
  high: "border-l-orange-500",
  normal: "border-l-blue-500",
  low: "border-l-gray-300",
};

const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
];

export default function TasksPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "normal",
    due_date: "",
  });
  const [createLoading, setCreateLoading] = useState(false);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    priority: "normal",
    status: "pending",
    due_date: "",
  });

  // Email scan state
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState<{
    scanned: number;
    found: number;
  } | null>(null);
  const [approving, setApproving] = useState<string | null>(null);

  const isConnected = user?.google_connected || user?.microsoft_connected;

  // -------------------------------------------------------------------------
  // Fetch tasks
  // -------------------------------------------------------------------------
  const fetchTasks = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      const data = await apiFetch<TasksResponse>(
        `/api/tasks/?${params.toString()}`,
        { token: accessToken }
      );
      setTasks(data.tasks);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [accessToken, filter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // -------------------------------------------------------------------------
  // Create task
  // -------------------------------------------------------------------------
  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    if (!accessToken || !newTask.title.trim()) return;
    setCreateLoading(true);
    try {
      await apiFetch("/api/tasks/", {
        method: "POST",
        token: accessToken,
        body: JSON.stringify({
          title: newTask.title.trim(),
          description: newTask.description.trim(),
          priority: newTask.priority,
          due_date: newTask.due_date || null,
        }),
      });
      setShowCreateForm(false);
      setNewTask({ title: "", description: "", priority: "normal", due_date: "" });
      fetchTasks();
    } catch {
      // ignore
    } finally {
      setCreateLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Update task
  // -------------------------------------------------------------------------
  async function handleSaveEdit() {
    if (!accessToken || !selectedTask) return;
    setActionLoading("edit");
    try {
      const updated = await apiFetch<Task>(`/api/tasks/${selectedTask.id}`, {
        method: "PUT",
        token: accessToken,
        body: JSON.stringify({
          title: editForm.title.trim(),
          description: editForm.description.trim(),
          priority: editForm.priority,
          status: editForm.status,
          due_date: editForm.due_date || null,
        }),
      });
      setSelectedTask(updated);
      setEditMode(false);
      fetchTasks();
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  // -------------------------------------------------------------------------
  // Complete task
  // -------------------------------------------------------------------------
  async function handleCompleteTask(taskId: string) {
    if (!accessToken) return;
    setActionLoading(taskId);
    try {
      const updated = await apiFetch<Task>(`/api/tasks/${taskId}/complete`, {
        method: "PATCH",
        token: accessToken,
      });
      if (selectedTask?.id === taskId) setSelectedTask(updated);
      fetchTasks();
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  // -------------------------------------------------------------------------
  // Delete task
  // -------------------------------------------------------------------------
  async function handleDeleteTask(taskId: string) {
    if (!accessToken) return;
    setActionLoading(taskId);
    try {
      await apiFetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
        token: accessToken,
      });
      if (selectedTask?.id === taskId) setSelectedTask(null);
      fetchTasks();
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  }

  // -------------------------------------------------------------------------
  // Scan emails for tasks
  // -------------------------------------------------------------------------
  async function handleScanEmails() {
    if (!accessToken) return;
    setScanLoading(true);
    setScanResult(null);
    setSuggestions([]);
    try {
      const data = await apiFetch<ScanEmailsForTasksResponse>(
        "/api/tasks/scan-emails",
        {
          method: "POST",
          token: accessToken,
          body: JSON.stringify({ query: "", page_size: 30 }),
        }
      );
      setSuggestions(data.suggestions);
      setScanResult({
        scanned: data.emails_scanned,
        found: data.tasks_found,
      });
    } catch {
      // ignore
    } finally {
      setScanLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Approve suggestion
  // -------------------------------------------------------------------------
  async function handleApproveSuggestion(suggestion: TaskSuggestion) {
    if (!accessToken) return;
    setApproving(suggestion.email_id);
    try {
      await apiFetch("/api/tasks/approve-suggestion", {
        method: "POST",
        token: accessToken,
        body: JSON.stringify({ suggestion }),
      });
      setSuggestions((prev) =>
        prev.filter((s) => s.email_id !== suggestion.email_id)
      );
      fetchTasks();
    } catch {
      // ignore
    } finally {
      setApproving(null);
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  function enterEditMode() {
    if (!selectedTask) return;
    setEditForm({
      title: selectedTask.title,
      description: selectedTask.description,
      priority: selectedTask.priority,
      status: selectedTask.status,
      due_date: selectedTask.due_date || "",
    });
    setEditMode(true);
  }

  function extractName(from: string): string {
    const match = from.match(/^(.+?)\s*</);
    return match ? match[1].trim().replace(/"/g, "") : from.split("@")[0];
  }

  const pendingCount = tasks.filter((t) => t.status === "pending").length;
  const inProgressCount = tasks.filter((t) => t.status === "in_progress").length;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col gap-4 md:pt-0 pt-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] flex items-center gap-2">
            <CheckSquare className="h-6 w-6" />
            Tasks
          </h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            {pendingCount > 0 && `${pendingCount} pending`}
            {pendingCount > 0 && inProgressCount > 0 && " · "}
            {inProgressCount > 0 && `${inProgressCount} in progress`}
            {pendingCount === 0 && inProgressCount === 0 && "No active tasks"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isConnected && (
            <button
              onClick={handleScanEmails}
              disabled={scanLoading}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 transition-colors disabled:opacity-50"
            >
              {scanLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Scan Emails for Tasks
            </button>
          )}
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            New Task
          </button>
        </div>
      </div>

      {/* Scan Results Banner */}
      {scanResult && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 dark:border-purple-800 dark:bg-purple-900/20">
          <div className="flex items-center justify-between">
            <p className="text-sm text-purple-700 dark:text-purple-300">
              <Sparkles className="inline h-4 w-4 mr-1" />
              Scanned {scanResult.scanned} emails — found{" "}
              <strong>{scanResult.found}</strong> action items in{" "}
              {suggestions.length} emails
            </p>
            <button
              onClick={() => {
                setScanResult(null);
                setSuggestions([]);
              }}
              className="text-purple-500 hover:text-purple-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Task Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.email_id}
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--foreground)] truncate">
                    {suggestion.email_subject || "No subject"}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                    From: {extractName(suggestion.email_from)}
                  </p>
                  <div className="mt-2 space-y-1">
                    {suggestion.tasks.map((task, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]"
                      >
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.normal
                          }`}
                        >
                          {task.priority}
                        </span>
                        <span className="text-[var(--foreground)]">
                          {task.title}
                        </span>
                        {task.suggested_due_date && (
                          <span className="flex items-center gap-0.5">
                            <Calendar className="h-3 w-3" />
                            {task.suggested_due_date}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleApproveSuggestion(suggestion)}
                    disabled={approving === suggestion.email_id}
                    className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                  >
                    {approving === suggestion.email_id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Approve"
                    )}
                  </button>
                  <button
                    onClick={() =>
                      setSuggestions((prev) =>
                        prev.filter((s) => s.email_id !== suggestion.email_id)
                      )
                    }
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--accent)] transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setFilter(tab.key);
              setSelectedTask(null);
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              filter === tab.key
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Split View */}
      <div className="flex flex-1 gap-4 min-h-0">
        {/* Task List */}
        <div className="w-full md:w-2/5 lg:w-1/3 overflow-y-auto space-y-2 pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--muted-foreground)]" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckSquare className="h-12 w-12 text-[var(--muted-foreground)] mb-3" />
              <p className="text-sm text-[var(--muted-foreground)]">
                {filter === "all"
                  ? "No tasks yet. Create a task or scan your emails."
                  : `No ${filter.replace("_", " ")} tasks.`}
              </p>
            </div>
          ) : (
            tasks.map((task) => {
              const StatusIcon = STATUS_ICONS[task.status] || Circle;
              return (
                <button
                  key={task.id}
                  onClick={() => {
                    setSelectedTask(task);
                    setEditMode(false);
                  }}
                  className={`w-full text-left rounded-lg border-l-4 border border-[var(--border)] p-3 transition-colors hover:bg-[var(--accent)] ${
                    PRIORITY_BORDER[task.priority] || PRIORITY_BORDER.normal
                  } ${
                    selectedTask?.id === task.id
                      ? "bg-[var(--accent)] ring-1 ring-[var(--primary)]"
                      : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <StatusIcon
                      className={`h-4 w-4 mt-0.5 shrink-0 ${
                        task.status === "completed"
                          ? "text-green-500"
                          : task.status === "in_progress"
                          ? "text-blue-500"
                          : "text-[var(--muted-foreground)]"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-medium truncate ${
                          task.status === "completed"
                            ? "line-through text-[var(--muted-foreground)]"
                            : "text-[var(--foreground)]"
                        }`}
                      >
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            PRIORITY_STYLES[task.priority] ||
                            PRIORITY_STYLES.normal
                          }`}
                        >
                          {task.priority}
                        </span>
                        {task.due_date && (
                          <span className="flex items-center gap-0.5 text-[10px] text-[var(--muted-foreground)]">
                            <Calendar className="h-3 w-3" />
                            {task.due_date}
                          </span>
                        )}
                        {task.source_email_id && (
                          <Mail className="h-3 w-3 text-[var(--muted-foreground)]" />
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[var(--muted-foreground)] shrink-0" />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Task Detail */}
        <div className="hidden md:flex flex-1 flex-col overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--background)]">
          {selectedTask ? (
            <div className="p-6 space-y-6">
              {editMode ? (
                /* Edit Mode */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-[var(--foreground)]">
                      Edit Task
                    </h2>
                    <button
                      onClick={() => setEditMode(false)}
                      className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                      Title
                    </label>
                    <input
                      type="text"
                      value={editForm.title}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, title: e.target.value }))
                      }
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                      Description
                    </label>
                    <textarea
                      value={editForm.description}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          description: e.target.value,
                        }))
                      }
                      rows={4}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                        Priority
                      </label>
                      <select
                        value={editForm.priority}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            priority: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                      >
                        <option value="urgent">Urgent</option>
                        <option value="high">High</option>
                        <option value="normal">Normal</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                        Status
                      </label>
                      <select
                        value={editForm.status}
                        onChange={(e) =>
                          setEditForm((f) => ({
                            ...f,
                            status: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={editForm.due_date}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          due_date: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditMode(false)}
                      className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent)] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={actionLoading === "edit"}
                      className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {actionLoading === "edit" && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      )}
                      Save Changes
                    </button>
                  </div>
                </div>
              ) : (
                /* View Mode */
                <>
                  {/* Title and badges */}
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-xl font-semibold text-[var(--foreground)]">
                        {selectedTask.title}
                      </h2>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            STATUS_STYLES[selectedTask.status] ||
                            STATUS_STYLES.pending
                          }`}
                        >
                          {selectedTask.status.replace("_", " ")}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            PRIORITY_STYLES[selectedTask.priority] ||
                            PRIORITY_STYLES.normal
                          }`}
                        >
                          {selectedTask.priority}
                        </span>
                      </div>
                    </div>

                    {selectedTask.description && (
                      <p className="mt-3 text-sm text-[var(--muted-foreground)] leading-relaxed">
                        {selectedTask.description}
                      </p>
                    )}
                  </div>

                  {/* Meta info */}
                  <div className="space-y-2 text-sm">
                    {selectedTask.due_date && (
                      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                        <Calendar className="h-4 w-4" />
                        <span>Due: {selectedTask.due_date}</span>
                      </div>
                    )}
                    {selectedTask.created_at && (
                      <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                        <Clock className="h-4 w-4" />
                        <span>
                          Created:{" "}
                          {new Date(selectedTask.created_at).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            }
                          )}
                        </span>
                      </div>
                    )}
                    {selectedTask.completed_at && (
                      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                        <CheckCircle className="h-4 w-4" />
                        <span>
                          Completed:{" "}
                          {new Date(
                            selectedTask.completed_at
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Source email */}
                  {selectedTask.source_email_id && (
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--accent)]/30 p-4">
                      <p className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-2">
                        Source Email
                      </p>
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        {selectedTask.source_email_subject || "No subject"}
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                        From: {selectedTask.source_email_from}
                      </p>
                      <a
                        href={`/dashboard/email?provider=${selectedTask.source_email_provider}&id=${selectedTask.source_email_id}`}
                        className="inline-flex items-center gap-1.5 mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        View source email
                      </a>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
                    {selectedTask.status !== "completed" && (
                      <button
                        onClick={() => handleCompleteTask(selectedTask.id)}
                        disabled={actionLoading === selectedTask.id}
                        className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        {actionLoading === selectedTask.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle className="h-3.5 w-3.5" />
                        )}
                        Mark Complete
                      </button>
                    )}
                    <button
                      onClick={enterEditMode}
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--accent)] transition-colors"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteTask(selectedTask.id)}
                      disabled={actionLoading === selectedTask.id}
                      className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <CheckSquare className="mx-auto h-12 w-12 text-[var(--muted-foreground)]" />
                <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                  Select a task to view details
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Task Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[var(--foreground)]">
                New Task
              </h2>
              <button
                onClick={() => setShowCreateForm(false)}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) =>
                    setNewTask((f) => ({ ...f, title: e.target.value }))
                  }
                  placeholder="Enter task title"
                  required
                  autoFocus
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Description
                </label>
                <textarea
                  value={newTask.description}
                  onChange={(e) =>
                    setNewTask((f) => ({ ...f, description: e.target.value }))
                  }
                  placeholder="Enter task description"
                  rows={3}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                    Priority
                  </label>
                  <select
                    value={newTask.priority}
                    onChange={(e) =>
                      setNewTask((f) => ({ ...f, priority: e.target.value }))
                    }
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                    Due Date
                  </label>
                  <input
                    type="date"
                    value={newTask.due_date}
                    onChange={(e) =>
                      setNewTask((f) => ({ ...f, due_date: e.target.value }))
                    }
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading || !newTask.title.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm text-[var(--primary-foreground)] hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {createLoading && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
