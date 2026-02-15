"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Settings, CheckCircle, XCircle, Loader2, Unplug } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { apiFetch } from "@/lib/api";

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Show success toast if redirected back from OAuth
  useEffect(() => {
    const connected = searchParams.get("connected");
    if (connected) {
      setToast(`${connected === "google" ? "Google" : "Microsoft"} account connected successfully!`);
      if (connected === "google") updateUser({ google_connected: true });
      if (connected === "microsoft") updateUser({ microsoft_connected: true });
      // Clear the query param
      window.history.replaceState({}, "", "/dashboard/settings");
      setTimeout(() => setToast(null), 4000);
    }
  }, [searchParams, updateUser]);

  async function handleConnect(provider: "google" | "microsoft") {
    setLoading(provider);
    try {
      const data = await apiFetch<{ auth_url: string }>(
        `/api/oauth/${provider}/authorize`,
        { token: accessToken || undefined }
      );
      // Redirect to OAuth provider
      window.location.href = data.auth_url;
    } catch {
      setToast(`Failed to connect ${provider}. Check your configuration.`);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setLoading(null);
    }
  }

  async function handleDisconnect(provider: "google" | "microsoft") {
    setLoading(provider);
    try {
      await apiFetch("/api/oauth/disconnect", {
        method: "POST",
        token: accessToken || undefined,
        body: JSON.stringify({ provider }),
      });
      updateUser({
        [provider === "google" ? "google_connected" : "microsoft_connected"]: false,
      });
      setToast(`${provider === "google" ? "Google" : "Microsoft"} account disconnected.`);
      setTimeout(() => setToast(null), 4000);
    } catch {
      setToast(`Failed to disconnect ${provider}.`);
      setTimeout(() => setToast(null), 4000);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Manage your account connections and preferences
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div className="rounded-lg bg-[var(--primary)] px-4 py-3 text-sm text-[var(--primary-foreground)]">
          {toast}
        </div>
      )}

      {/* Connected Accounts */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Connected Accounts
        </h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Connect your email and calendar providers to enable AI-powered management.
        </p>

        <div className="mt-6 space-y-4">
          {/* Google */}
          <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-4">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/20">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </div>
              <div>
                <p className="font-medium text-[var(--foreground)]">Google Workspace</p>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Gmail &amp; Google Calendar
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {user?.google_connected ? (
                <>
                  <span className="flex items-center gap-1 text-sm text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    Connected
                  </span>
                  <button
                    onClick={() => handleDisconnect("google")}
                    disabled={loading === "google"}
                    className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:bg-[var(--accent)] transition-colors disabled:opacity-50"
                  >
                    {loading === "google" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Unplug className="h-4 w-4" />
                    )}
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleConnect("google")}
                  disabled={loading === "google"}
                  className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {loading === "google" && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Connect Google
                </button>
              )}
            </div>
          </div>

          {/* Microsoft */}
          <div className="flex items-center justify-between rounded-lg border border-[var(--border)] p-4">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
                  <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                  <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
                  <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
                  <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-[var(--foreground)]">Microsoft 365</p>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Outlook Mail &amp; Calendar
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {user?.microsoft_connected ? (
                <>
                  <span className="flex items-center gap-1 text-sm text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    Connected
                  </span>
                  <button
                    onClick={() => handleDisconnect("microsoft")}
                    disabled={loading === "microsoft"}
                    className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:bg-[var(--accent)] transition-colors disabled:opacity-50"
                  >
                    {loading === "microsoft" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Unplug className="h-4 w-4" />
                    )}
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleConnect("microsoft")}
                  disabled={loading === "microsoft"}
                  className="flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {loading === "microsoft" && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Connect Microsoft
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Profile Info */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">Profile</h2>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-sm text-[var(--muted-foreground)]">Name</label>
            <p className="text-[var(--foreground)]">{user?.full_name}</p>
          </div>
          <div>
            <label className="text-sm text-[var(--muted-foreground)]">Email</label>
            <p className="text-[var(--foreground)]">{user?.email}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
