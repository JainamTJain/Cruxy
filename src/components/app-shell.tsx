"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/types";
import { CruxyProvider } from "@/components/cruxy/cruxy-context";
import { FloatingCruxy } from "@/components/cruxy/floating-cruxy";
import { CruxyLamp } from "@/components/cruxy/cruxy-lamp";
import { CruxyDrawer } from "@/components/cruxy/cruxy-drawer";

type Me = {
  authenticated: boolean;
  session?: {
    name: string;
    role: Role;
    adminView: boolean;
    teamId: string | null;
  };
  dataMode?: string;
};

const NAV = [
  { href: "/home", label: "Program map" },
  { href: "/library", label: "Library" },
  { href: "/case-brain", label: "Case brain" },
  { href: "/team", label: "Team" },
  { href: "/team/chat", label: "Chat" },
  { href: "/checklist", label: "First run" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);

  async function refresh() {
    const res = await fetch("/api/auth/me");
    const data = (await res.json()) as Me;
    if (!data.authenticated) {
      router.replace("/sign-in");
      return;
    }
    setMe(data);
  }

  useEffect(() => {
    void refresh();
    // refresh on navigation; intentional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  async function toggleAdmin(adminView: boolean) {
    await fetch("/api/auth/admin-view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminView }),
    });
    await refresh();
    router.push(adminView ? "/admin" : "/home");
  }

  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    router.replace("/sign-in");
  }

  const isAdminRole =
    me?.session?.role === "tech_admin" || me?.session?.role === "coach_admin";

  return (
    <CruxyProvider>
      <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 pb-28 pt-4 sm:pb-8 sm:pt-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              href="/home"
              className="font-display text-2xl font-semibold text-cardinal"
            >
              crux
            </Link>
            {me?.session ? (
              <p className="text-xs text-muted">
                {me.session.name}
                {me.session.adminView ? " · admin view" : ""}
                {me.dataMode === "sample" ? " · sample data" : ""}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdminRole ? (
              <button
                type="button"
                onClick={() => void toggleAdmin(!me?.session?.adminView)}
                className="rounded-xl border border-ink/15 bg-white/70 px-3 py-2 text-xs font-medium"
              >
                {me?.session?.adminView
                  ? "Back to member view"
                  : "Admin switch"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-xl px-3 py-2 text-xs text-muted underline"
            >
              Sign out
            </button>
          </div>
        </header>

        <div className="flex flex-1 gap-6">
          <nav className="hidden w-44 shrink-0 flex-col gap-1 sm:flex">
            {NAV.map((item) => {
              const active =
                item.href === "/home"
                  ? pathname === item.href
                  : pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-xl px-3 py-2 text-sm",
                    active
                      ? "bg-ink text-white"
                      : "text-ink/80 hover:bg-white/70",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            {me?.session?.adminView ? (
              <>
                <Link
                  href="/admin"
                  className={cn(
                    "rounded-xl px-3 py-2 text-sm",
                    pathname === "/admin"
                      ? "bg-ink text-white"
                      : "text-ink/80 hover:bg-white/70",
                  )}
                >
                  Admin console
                </Link>
                {me.session.role === "tech_admin" ? (
                  <>
                    <Link
                      href="/admin/passcodes"
                      className={cn(
                        "rounded-xl px-3 py-2 text-sm",
                        pathname.startsWith("/admin/passcodes")
                          ? "bg-ink text-white"
                          : "text-ink/80 hover:bg-white/70",
                      )}
                    >
                      Passcodes
                    </Link>
                    <Link
                      href="/admin/books"
                      className={cn(
                        "rounded-xl px-3 py-2 text-sm",
                        pathname.startsWith("/admin/books")
                          ? "bg-ink text-white"
                          : "text-ink/80 hover:bg-white/70",
                      )}
                    >
                      Books
                    </Link>
                  </>
                ) : null}
              </>
            ) : null}
          </nav>
          <div className="min-w-0 flex-1">{children}</div>
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-ink/10 bg-paper/95 px-2 py-2 backdrop-blur sm:hidden">
          <div className="mx-auto flex max-w-lg justify-around text-[11px]">
            {NAV.slice(0, 4).map((item) => {
              const active =
                item.href === "/home"
                  ? pathname === item.href
                  : pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "px-2 py-1",
                    active ? "font-semibold text-cardinal" : "text-muted",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            {me?.session?.adminView ? (
              <Link
                href="/admin"
                className={cn(
                  "px-2 py-1",
                  pathname.startsWith("/admin")
                    ? "font-semibold text-cardinal"
                    : "text-muted",
                )}
              >
                Admin
              </Link>
            ) : null}
          </div>
        </nav>

        <FloatingCruxy />
        <CruxyLamp />
        <CruxyDrawer />
      </div>
    </CruxyProvider>
  );
}
