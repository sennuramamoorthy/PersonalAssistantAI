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
  Send,
  Plus,
  X,
  Reply,
  CheckCircle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";
import type { Email, InboxResponse, SendEmailResponse } from "@/types/email";

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
  const [providerErrors, setProviderErrors] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // AI features state
  const [categorization, setCategorization] = useState<Record<string, unknown> | null>(null);
  const [aiDraft, setAiDraft] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [draftInstruction, setDraftInstruction] = useState("");
  const [showDraft, setShowDraft] = useState(false);

  // Reply state
  const [replyMode, setReplyMode] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [sendLoading, setSendLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);

  // Compose modal state
  const [showCompose, setShowCompose] = useState(false);
  const [composeForm, setComposeForm] = useState({
    to: "",
    subject: "",
    body: "",
    provider: "" as "google" | "microsoft",
  });
  const [composeLoading, setComposeLoading] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

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
      setProviderErrors(data.errors || []);
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
    setReplyMode(false);
    setReplyBody("");
    setSendError(null);
    setSendSuccess(false);
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
      setReplyBody(result.draft);
      setReplyMode(true);
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

  async function handleSendReply() {
    if (!selectedEmail || !replyBody.trim()) return;
    setSendLoading(true);
    setSendError(null);
    try {
      await apiFetch<SendEmailResponse>("/api/email/send", {
        method: "POST",
        token: accessToken || undefined,
        body: JSON.stringify({
          provider: selectedEmail.provider,
          to: selectedEmail.from,
          subject: selectedEmail.subject.startsWith("Re:")
            ? selectedEmail.subject
            : `Re: ${selectedEmail.subject}`,
          body: replyBody,
          reply_to_id: selectedEmail.id,
        }),
      });
      setSendSuccess(true);
      setReplyBody("");
      setReplyMode(false);
      setAiDraft(null);
      setShowDraft(false);
      setTimeout(() => setSendSuccess(false), 3000);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send reply");
    } finally {
      setSendLoading(false);
    }
  }

  async function handleSendCompose() {
    if (!composeForm.to.trim() || !composeForm.subject.trim() || !composeForm.body.trim()) {
      setComposeError("Please fill in all fields");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(composeForm.to.trim())) {
      setComposeError("Please enter a valid email address");
      return;
    }
    setComposeLoading(true);
    setComposeError(null);
    try {
      await apiFetch<SendEmailResponse>("/api/email/send", {
        method: "POST",
        token: accessToken || undefined,
        body: JSON.stringify({
          provider: composeForm.provider,
          to: composeForm.to.trim(),
          subject: composeForm.subject.trim(),
          body: composeForm.body.trim(),
        }),
      });
      setShowCompose(false);
      setComposeForm({ to: "", subject: "", body: "", provider: composeForm.provider });
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 3000);
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setComposeLoading(false);
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const defaultProvider = user?.google_connected
                ? "google"
                : "microsoft";
              setComposeForm({
                to: "",
                subject: "",
                body: "",
                provider: defaultProvider as "google" | "microsoft",
              });
              setComposeError(null);
              setShowCompose(true);
            }}
            className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Compose
          </button>
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

      {providerErrors.length > 0 && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 space-y-1">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Provider Errors
          </p>
          {providerErrors.map((err, i) => (
            <p key={i} className="text-sm text-amber-700 dark:text-amber-400">
              {err.includes("403")
                ? `${err.split(":")[0]}: Access denied — please ensure the Gmail API is enabled in your Google Cloud Console and the required scopes are authorized.`
                : err}
            </p>
          ))}
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
                      onClick={() => {
                        setReplyMode(true);
                        setReplyBody("");
                        setSendError(null);
                        setShowDraft(false);
                        setAiDraft(null);
                      }}
                      className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm text-[var(--primary-foreground)] hover:opacity-90 transition-opacity"
                    >
                      <Reply className="h-3.5 w-3.5" />
                      Reply
                    </button>
                    <button
                      onClick={handleDraft}
                      disabled={aiLoading}
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--accent)] transition-colors disabled:opacity-50"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      AI Draft Reply
                    </button>
                    <button
                      onClick={handleCategorize}
                      disabled={aiLoading}
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--accent)] transition-colors disabled:opacity-50"
                    >
                      <Filter className="h-3.5 w-3.5" />
                      Categorize
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
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-[var(--foreground)]">
                          AI Draft Reply
                        </h4>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          To: {selectedEmail?.from}
                        </p>
                      </div>
                      <textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm leading-relaxed text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)] resize-y min-h-[400px]"
                      />
                      {sendError && (
                        <p className="text-sm text-red-600">{sendError}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-[var(--muted-foreground)]">
                          Edit the draft above, then click Send Reply.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={handleDraft}
                            disabled={aiLoading}
                            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--accent)] transition-colors disabled:opacity-50"
                          >
                            Regenerate
                          </button>
                          <button
                            onClick={handleSendReply}
                            disabled={sendLoading || !replyBody.trim()}
                            className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm text-[var(--primary-foreground)] hover:opacity-90 transition-opacity disabled:opacity-50"
                          >
                            {sendLoading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Send className="h-3.5 w-3.5" />
                            )}
                            Send Reply
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Manual Reply (without AI draft) */}
                  {replyMode && !showDraft && (
                    <div className="rounded-lg border border-[var(--border)] p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium text-[var(--foreground)]">
                          Reply
                        </h4>
                        <p className="text-xs text-[var(--muted-foreground)]">
                          To: {selectedEmail?.from}
                        </p>
                      </div>
                      <textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        placeholder="Type your reply..."
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm leading-relaxed text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--ring)] resize-y min-h-[400px]"
                      />
                      {sendError && (
                        <p className="text-sm text-red-600">{sendError}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setReplyMode(false);
                            setReplyBody("");
                          }}
                          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--accent)] transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleDraft}
                          disabled={aiLoading}
                          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--accent)] transition-colors disabled:opacity-50"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Use AI Draft
                        </button>
                        <button
                          onClick={handleSendReply}
                          disabled={sendLoading || !replyBody.trim()}
                          className="flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm text-[var(--primary-foreground)] hover:opacity-90 transition-opacity disabled:opacity-50"
                        >
                          {sendLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          Send Reply
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Send Success */}
                  {sendSuccess && (
                    <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-2.5 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <p className="text-sm text-green-700 dark:text-green-400">Email sent successfully</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Compose Email Modal */}
      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowCompose(false)}
          />
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-xl mx-4">
            <div className="p-6 space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[var(--foreground)]">
                  Compose Email
                </h2>
                <button
                  onClick={() => setShowCompose(false)}
                  className="p-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {composeError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-2.5">
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {composeError}
                  </p>
                </div>
              )}

              {/* Send from */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                  Send from
                </label>
                <select
                  value={composeForm.provider}
                  onChange={(e) =>
                    setComposeForm((f) => ({
                      ...f,
                      provider: e.target.value as "google" | "microsoft",
                    }))
                  }
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                >
                  {user?.google_connected && (
                    <option value="google">Gmail</option>
                  )}
                  {user?.microsoft_connected && (
                    <option value="microsoft">Outlook</option>
                  )}
                </select>
              </div>

              {/* To */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                  To <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={composeForm.to}
                  onChange={(e) =>
                    setComposeForm((f) => ({ ...f, to: e.target.value }))
                  }
                  placeholder="recipient@example.com"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </div>

              {/* Subject */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                  Subject <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={composeForm.subject}
                  onChange={(e) =>
                    setComposeForm((f) => ({ ...f, subject: e.target.value }))
                  }
                  placeholder="Email subject"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
                  Message <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={composeForm.body}
                  onChange={(e) =>
                    setComposeForm((f) => ({ ...f, body: e.target.value }))
                  }
                  placeholder="Write your message..."
                  rows={8}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] resize-y"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2 border-t border-[var(--border)]">
                <button
                  onClick={() => setShowCompose(false)}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-[var(--accent)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendCompose}
                  disabled={composeLoading}
                  className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {composeLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Send Email
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
