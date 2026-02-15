"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Mail,
  Search,
  RefreshCw,
  Loader2,
  Star,
  Settings,
  Inbox,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";
import type { Email, InboxResponse } from "@/types/email";

type ProviderFilter = "all" | "google" | "microsoft";

export default function EmailPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);

  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // AI features state
  const [categorization, setCategorization] = useState<Record<string, unknown> | null>(null);
  const [aiDraft, setAiDraft] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [draftInstruction, setDraftInstruction] = useState("");
  const [showDraft, setShowDraft] = useState(false);

  const isConnected = user?.google_connected || user?.microsoft_connected;

  const fetchInbox = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (providerFilter !== "all") params.set("provider", providerFilter);
      if (query) params.set("query", query);
      const qs = params.toString();
      const data = await apiFetch<InboxResponse>(
        `/api/email/inbox${qs ? `?${qs}` : ""}`,
        { token: accessToken || undefined }
      );
      setEmails(data.emails);
      setUnreadCount(data.unread);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch emails");
    } finally {
      setLoading(false);
    }
  }, [isConnected, providerFilter, query, accessToken]);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  async function handleSelectEmail(email: Email) {
    setSelectedId(email.id);
    setSelectedEmail(null);
    setCategorization(null);
    setAiDraft(null);
    setShowDraft(false);
    setDetailLoading(true);

    try {
      const detail = await apiFetch<Email>(
        `/api/email/message/${email.provider}/${email.id}`,
        { token: accessToken || undefined }
      );
      setSelectedEmail(detail);

      // Mark as read if unread
      if (email.is_unread) {
        await apiFetch("/api/email/mark-read", {
          method: "POST",
          token: accessToken || undefined,
          body: JSON.stringify({ provider: email.provider, email_id: email.id }),
        });
        setEmails((prev) =>
          prev.map((e) => (e.id === email.id ? { ...e, is_unread: false } : e))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    } catch {
      setSelectedEmail(email); // fallback to list data
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleCategorize() {
    if (!selectedEmail) return;
    setAiLoading(true);
    try {
      const result = await apiFetch<Record<string, unknown>>("/api/email/categorize", {
        method: "POST",
        token: accessToken || undefined,
        body: JSON.stringify({
          from_addr: selectedEmail.from,
          subject: selectedEmail.subject,
          body: selectedEmail.body || selectedEmail.snippet,
        }),
      });
      setCategorization(result);
    } catch {
      // ignore
    } finally {
      setAiLoading(false);
    }
  }

  async function handleDraft() {
    if (!selectedEmail) return;
    setAiLoading(true);
    setShowDraft(true);
    try {
      const result = await apiFetch<{ draft: string }>("/api/email/draft", {
        method: "POST",
        token: accessToken || undefined,
        body: JSON.stringify({
          from_addr: selectedEmail.from,
          subject: selectedEmail.subject,
          body: selectedEmail.body || selectedEmail.snippet,
          sender_type: (categorization as Record<string, string>)?.sender_type || "unknown",
          instruction: draftInstruction,
        }),
      });
      setAiDraft(result.draft);
    } catch {
      setAiDraft("Failed to generate draft. Please try again.");
    } finally {
      setAiLoading(false);
    }
  }

  async function handleArchive(email: Email) {
    try {
      await apiFetch("/api/email/archive", {
        method: "POST",
        token: accessToken || undefined,
        body: JSON.stringify({ provider: email.provider, email_id: email.id }),
      });
      setEmails((prev) => prev.filter((e) => e.id !== email.id));
      if (selectedId === email.id) {
        setSelectedId(null);
        setSelectedEmail(null);
      }
    } catch {
      // ignore
    }
  }

  function extractName(from: string): string {
    const match = from.match(/^(.+?)\s*</);
    return match ? match[1].trim().replace(/"/g, "") : from.split("@")[0];
  }

  function formatDate(dateStr: string): string {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  }

  // Not connected state
  if (!isConnected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Email</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            AI-powered email management
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-12 shadow-sm text-center">
          <Mail className="h-12 w-12 mx-auto text-[var(--muted-foreground)]" />
          <h2 className="mt-4 text-lg font-semibold text-[var(--foreground)]">
            Connect Your Email
          </h2>
          <p className="mt-2 text-sm text-[var(--muted-foreground)] max-w-md mx-auto">
            Connect your Google or Microsoft account in Settings to start
            managing your emails with AI assistance.
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Email</h1>
          <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
        <button
          onClick={fetchInbox}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--accent)] transition-colors disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            type="text"
            placeholder="Search emails..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchInbox()}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] pl-9 pr-4 py-2 text-sm placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] p-1">
          {(["all", "google", "microsoft"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setProviderFilter(f)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                providerFilter === f
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              )}
            >
              {f === "all" ? "All" : f === "google" ? "Gmail" : "Outlook"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Email List + Detail Split View */}
      <div className="flex gap-4 min-h-[calc(100vh-240px)]">
        {/* Email List */}
        <div className={cn(
          "rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-sm overflow-hidden",
          selectedEmail ? "w-2/5 hidden md:block" : "w-full"
        )}>
          {loading && emails.length === 0 ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--muted-foreground)]" />
            </div>
          ) : emails.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <Inbox className="h-10 w-10 text-[var(--muted-foreground)]" />
              <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                No emails found
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {emails.map((email) => (
                <button
                  key={`${email.provider}-${email.id}`}
                  onClick={() => handleSelectEmail(email)}
                  className={cn(
                    "w-full text-left px-4 py-3 hover:bg-[var(--accent)] transition-colors",
                    selectedId === email.id && "bg-[var(--accent)]",
                    email.is_unread && "bg-blue-50/50 dark:bg-blue-900/10"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {email.is_unread && (
                          <span className="h-2 w-2 rounded-full bg-[var(--primary)] flex-shrink-0" />
                        )}
                        <p className={cn(
                          "truncate text-sm",
                          email.is_unread ? "font-semibold text-[var(--foreground)]" : "text-[var(--foreground)]"
                        )}>
                          {extractName(email.from)}
                        </p>
                        <span className="flex-shrink-0 rounded bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]">
                          {email.provider === "google" ? "Gmail" : "Outlook"}
                        </span>
                      </div>
                      <p className={cn(
                        "truncate text-sm mt-0.5",
                        email.is_unread ? "font-medium text-[var(--foreground)]" : "text-[var(--muted-foreground)]"
                      )}>
                        {email.subject}
                      </p>
                      <p className="truncate text-xs text-[var(--muted-foreground)] mt-0.5">
                        {email.snippet}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {formatDate(email.date)}
                      </span>
                      {email.is_starred && (
                        <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Email Detail */}
        {selectedEmail && (
          <div className={cn(
            "rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-sm overflow-auto",
            "flex-1"
          )}>
            {detailLoading ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-[var(--muted-foreground)]" />
              </div>
            ) : (
              <div className="p-6 space-y-6">
                {/* Email Header */}
                <div>
                  <div className="flex items-start justify-between">
                    <h2 className="text-lg font-semibold text-[var(--foreground)]">
                      {selectedEmail.subject}
                    </h2>
                    <button
                      onClick={() => {
                        setSelectedId(null);
                        setSelectedEmail(null);
                      }}
                      className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] md:hidden"
                    >
                      Back
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-[var(--muted)] flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-medium text-[var(--muted-foreground)]">
                        {extractName(selectedEmail.from).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        {selectedEmail.from}
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        To: {selectedEmail.to} &middot; {formatDate(selectedEmail.date)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Email Body */}
                <div className="prose prose-sm max-w-none text-[var(--foreground)] text-sm leading-relaxed whitespace-pre-wrap">
                  {selectedEmail.body || selectedEmail.snippet}
                </div>

                {/* AI Actions */}
                <div className="border-t border-[var(--border)] pt-4 space-y-4">
                  <h3 className="text-sm font-semibold text-[var(--foreground)]">
                    AI Assistant
                  </h3>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleCategorize}
                      disabled={aiLoading}
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--accent)] transition-colors disabled:opacity-50"
                    >
                      <Filter className="h-3.5 w-3.5" />
                      Categorize
                    </button>
                    <button
                      onClick={handleDraft}
                      disabled={aiLoading}
                      className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm text-[var(--primary-foreground)] hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Draft Reply
                    </button>
                    <button
                      onClick={() => handleArchive(selectedEmail)}
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--accent)] transition-colors"
                    >
                      Archive
                    </button>
                  </div>

                  {/* Optional instruction for draft */}
                  <div>
                    <input
                      type="text"
                      placeholder="Optional instruction for AI draft (e.g., 'politely decline the meeting')"
                      value={draftInstruction}
                      onChange={(e) => setDraftInstruction(e.target.value)}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)]"
                    />
                  </div>

                  {/* AI Loading */}
                  {aiLoading && (
                    <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      AI is thinking...
                    </div>
                  )}

                  {/* Categorization Results */}
                  {categorization && (
                    <div className="rounded-lg border border-[var(--border)] p-4 space-y-2">
                      <h4 className="text-sm font-medium text-[var(--foreground)]">
                        AI Categorization
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-[var(--muted-foreground)]">Sender: </span>
                          <span className="font-medium capitalize">
                            {String(categorization.sender_type).replace("_", " ")}
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--muted-foreground)]">Priority: </span>
                          <span className={cn(
                            "font-medium capitalize",
                            categorization.priority === "urgent" && "text-red-600",
                            categorization.priority === "high" && "text-orange-600",
                          )}>
                            {String(categorization.priority)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--muted-foreground)]">Category: </span>
                          <span className="font-medium capitalize">
                            {String(categorization.category)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[var(--muted-foreground)]">Needs reply: </span>
                          <span className="font-medium">
                            {categorization.requires_response ? "Yes" : "No"}
                          </span>
                        </div>
                      </div>
                      {categorization.summary ? (
                        <p className="text-sm text-[var(--muted-foreground)] mt-1">
                          {String(categorization.summary)}
                        </p>
                      ) : null}
                    </div>
                  )}

                  {/* AI Draft */}
                  {showDraft && aiDraft && (
                    <div className="rounded-lg border border-[var(--border)] p-4 space-y-3">
                      <h4 className="text-sm font-medium text-[var(--foreground)]">
                        AI Draft Reply
                      </h4>
                      <div className="bg-[var(--muted)] rounded-lg p-3 text-sm whitespace-pre-wrap">
                        {aiDraft}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleDraft}
                          disabled={aiLoading}
                          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--accent)] transition-colors disabled:opacity-50"
                        >
                          Regenerate
                        </button>
                      </div>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        Review and edit the draft before sending. The AI draft requires your approval.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
