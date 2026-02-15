"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";
import {
  Mail,
  Calendar,
  Users,
  Plane,
  Sparkles,
  Loader2,
  AlertCircle,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

interface DashboardStats {
  unread_emails: number;
  todays_meetings: number;
  weeks_events: number;
  upcoming_trips: number;
}

interface PendingAction {
  type: string;
  title: string;
  description: string;
  action_url: string;
  priority: string;
}

const STAT_CONFIG = [
  { key: "unread_emails", name: "Unread Emails", icon: Mail, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-900/20", href: "/dashboard/email" },
  { key: "todays_meetings", name: "Today's Meetings", icon: Users, color: "text-green-500", bg: "bg-green-50 dark:bg-green-900/20", href: "/dashboard/meetings" },
  { key: "weeks_events", name: "This Week's Events", icon: Calendar, color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-900/20", href: "/dashboard/calendar" },
  { key: "upcoming_trips", name: "Upcoming Trips", icon: Plane, color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-900/20", href: "/dashboard/travel" },
] as const;

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "border-l-red-500 bg-red-50/50 dark:bg-red-900/10",
  high: "border-l-orange-500 bg-orange-50/50 dark:bg-orange-900/10",
  normal: "border-l-blue-500 bg-blue-50/50 dark:bg-blue-900/10",
  low: "border-l-gray-300 bg-gray-50/50 dark:bg-gray-800/50",
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const router = useRouter();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [actionsLoading, setActionsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!accessToken) return;
    setStatsLoading(true);
    try {
      const data = await apiFetch<DashboardStats>("/api/dashboard/stats", {
        token: accessToken,
      });
      setStats(data);
    } catch {
      // Stats will show dashes
    } finally {
      setStatsLoading(false);
    }
  }, [accessToken]);

  const fetchActions = useCallback(async () => {
    if (!accessToken) return;
    setActionsLoading(true);
    try {
      const data = await apiFetch<{ actions: PendingAction[] }>("/api/dashboard/actions", {
        token: accessToken,
      });
      setActions(data.actions);
    } catch {
      // ignore
    } finally {
      setActionsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchStats();
    fetchActions();
  }, [fetchStats, fetchActions]);

  async function handleGenerateBriefing() {
    if (!accessToken) return;
    setBriefingLoading(true);
    setBriefing(null);
    try {
      const data = await apiFetch<{ briefing: string }>("/api/dashboard/briefing", {
        token: accessToken,
      });
      setBriefing(data.briefing);
    } catch {
      setBriefing("Unable to generate briefing. Please connect your email and calendar accounts in Settings.");
    } finally {
      setBriefingLoading(false);
    }
  }

  const isConnected = user?.google_connected || user?.microsoft_connected;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">
            {getGreeting()}, {user?.full_name?.split(" ")[0] || "Chairman"}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Here&apos;s your daily overview
          </p>
        </div>
        <button
          onClick={() => { fetchStats(); fetchActions(); }}
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted-foreground)] hover:bg-[var(--accent)] transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAT_CONFIG.map((stat) => {
          const value = stats ? stats[stat.key as keyof DashboardStats] : null;
          return (
            <button
              key={stat.key}
              onClick={() => router.push(stat.href)}
              className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-sm text-left hover:bg-[var(--accent)] transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.bg}`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {stat.name}
                  </p>
                  <p className="text-2xl font-bold text-[var(--foreground)]">
                    {statsLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-[var(--muted-foreground)]" />
                    ) : (
                      value ?? "—"
                    )}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* AI Briefing */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              AI Daily Briefing
            </h2>
            {isConnected && (
              <button
                onClick={handleGenerateBriefing}
                disabled={briefingLoading}
                className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                {briefingLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {briefing ? "Refresh" : "Generate"}
              </button>
            )}
          </div>

          {briefing ? (
            <div className="mt-4 text-sm text-[var(--muted-foreground)] whitespace-pre-wrap leading-relaxed">
              {briefing}
            </div>
          ) : briefingLoading ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating your daily briefing...
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--muted-foreground)]">
              {isConnected
                ? "Click \"Generate\" to get your AI-powered daily briefing with email summaries, meeting highlights, and action items."
                : "Connect your email and calendar accounts in Settings to receive your AI-powered daily briefing."}
            </p>
          )}
        </div>

        {/* Pending Actions */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            Pending Actions
          </h2>

          {actionsLoading ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading actions...
            </div>
          ) : actions.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--muted-foreground)]">
              No pending actions. Your AI assistant will surface items needing your
              attention here.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {actions.map((action, i) => (
                <button
                  key={i}
                  onClick={() => router.push(action.action_url)}
                  className={`w-full rounded-lg border-l-4 p-3 text-left transition-colors hover:opacity-80 ${
                    PRIORITY_STYLES[action.priority] || PRIORITY_STYLES.normal
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {action.title}
                    </p>
                    <span className={`text-xs font-medium uppercase ${
                      action.priority === "urgent" ? "text-red-600" :
                      action.priority === "high" ? "text-orange-600" : "text-blue-600"
                    }`}>
                      {action.priority}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                    {action.description}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Quick Actions</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button
            onClick={() => router.push("/dashboard/email")}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
          >
            <Mail className="h-4 w-4 text-blue-500" />
            Check Email
          </button>
          <button
            onClick={() => router.push("/dashboard/calendar")}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
          >
            <Calendar className="h-4 w-4 text-purple-500" />
            View Calendar
          </button>
          <button
            onClick={() => router.push("/dashboard/meetings")}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
          >
            <Users className="h-4 w-4 text-green-500" />
            Meetings
          </button>
          <button
            onClick={() => router.push("/dashboard/travel")}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] p-3 text-sm text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors"
          >
            <Plane className="h-4 w-4 text-orange-500" />
            Travel Plans
          </button>
        </div>
      </div>
    </div>
  );
}
