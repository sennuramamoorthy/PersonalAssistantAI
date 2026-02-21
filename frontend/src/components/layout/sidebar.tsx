"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Mail,
  Calendar,
  Users,
  Plane,
  MessageSquare,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { useAuthStore } from "@/stores/auth-store";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Email", href: "/dashboard/email", icon: Mail },
  { name: "Calendar", href: "/dashboard/calendar", icon: Calendar },
  { name: "Meetings", href: "/dashboard/meetings", icon: Users },
  { name: "Travel", href: "/dashboard/travel", icon: Plane },
  { name: "Chat", href: "/dashboard/chat", icon: MessageSquare },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const user = useAuthStore((s) => s.user);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    clearAuth();
    router.push("/login");
  };

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-[var(--border)] px-6">
        <div className="h-8 w-8 rounded-lg bg-[var(--primary)] flex items-center justify-center">
          <span className="text-sm font-bold text-[var(--primary-foreground)]">
            PA
          </span>
        </div>
        <span className="text-lg font-semibold text-[var(--foreground)]">
          Assistant AI
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]"
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-[var(--border)] p-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-[var(--muted)] flex items-center justify-center">
            <span className="text-sm font-medium text-[var(--muted-foreground)]">
              {user?.full_name?.charAt(0)?.toUpperCase() || "U"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--foreground)] truncate">
              {user?.full_name || "User"}
            </p>
            <p className="text-xs text-[var(--muted-foreground)] truncate">
              {user?.email || ""}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-md bg-[var(--background)] p-2 shadow-md border border-[var(--border)] md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[var(--sidebar-width)] bg-[var(--background)] border-r border-[var(--border)] transform transition-transform duration-200 md:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute right-3 top-5 text-[var(--muted-foreground)]"
        >
          <X className="h-5 w-5" />
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-[var(--sidebar-width)] md:flex-col md:fixed md:inset-y-0 bg-[var(--background)] border-r border-[var(--border)]">
        {sidebarContent}
      </aside>
    </>
  );
}
