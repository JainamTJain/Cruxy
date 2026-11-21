"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CruxyProvider, useCruxy } from "@/components/cruxy/cruxy-context";
import { CruxyDrawer } from "@/components/cruxy/cruxy-drawer";
import { CruxyLamp } from "@/components/cruxy/cruxy-lamp";
import { FloatingCruxy } from "@/components/cruxy/floating-cruxy";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/types";

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

const SIDE_NAV = [
  { href: "/home", label: "Program map" },
  { href: "/revision/roadmap", label: "My roadmap" },
  { href: "/case-brain", label: "Cases" },
  { href: "/library", label: "Reading room" },
  { href: "/practice", label: "Practice" },
  { href: "/team", label: "Team" },
  { href: "/team/chat", label: "Team chat" },
  { href: "/revision", label: "Revision" },
  { href: "/settings", label: "Settings" },
];

const PHONE_TABS = [
  { href: "/home", label: "Today" },
  { href: "/case-brain", label: "Cases" },
  { href: "/practice", label: "Practice" },
  { href: "/team", label: "Team" },
];

function navActive(pathname: string, href: string) {
  if (href === "/home") return pathname === "/home" || pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function AskCruxyButton() {
  const { wake, setDrawerOpen, awake } = useCruxy();
  return (
    <button
      type="button"
      onClick={() => {
        if (!awake) wake();
        else setDrawerOpen(true);
      }}
      className="flex items-center gap-2 rounded-xl bg-gold px-3 py-2 text-sm font-semibold text-ink shadow-sm transition hover:brightness-95"
    >
      <Image
        src="/cruxy/cruxy-lamp.png"
        alt=""
        width={18}
        height={18}
        unoptimized
      />
      Ask Cruxy
    </button>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const { wake, setDrawerOpen, awake } = useCruxy();

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
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 pb-24 pt-4 sm:pb-8 sm:pt-6">
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
              {me.session.adminView ? " · admin" : ""}
              {me.dataMode === "sample" ? " · sample data" : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden sm:block">
            <AskCruxyButton />
          </div>
          {isAdminRole ? (
            <button
              type="button"
              onClick={() => void toggleAdmin(!me?.session?.adminView)}
              className="rounded-xl border border-ink/15 bg-white/70 px-3 py-2 text-xs font-medium"
            >
              {me?.session?.adminView ? "Back to member view" : "Admin switch"}
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
        <nav className="hidden w-48 shrink-0 flex-col gap-1 sm:flex">
          <div className="mb-3 rounded-2xl bg-ink px-3 py-4 text-paper shadow-md">
            <p className="font-display text-lg font-semibold tracking-tight">
              crux
            </p>
            <p className="mt-1 text-[11px] text-paper/60">
              Ethics Bowl · USC
            </p>
            <div className="mt-3">
              <AskCruxyButton />
            </div>
          </div>
          {SIDE_NAV.map((item) => {
            const active = navActive(pathname, item.href);
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
              <div className="my-2 h-px bg-ink/10" />
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
              <Link
                href="/admin/competition"
                className={cn(
                  "rounded-xl px-3 py-2 text-sm",
                  pathname.startsWith("/admin/competition")
                    ? "bg-ink text-white"
                    : "text-ink/80 hover:bg-white/70",
                )}
              >
                Competition log
              </Link>
              {me.session.role === "tech_admin" ? (
                <>
                  <Link
                    href="/admin/spend"
                    className={cn(
                      "rounded-xl px-3 py-2 text-sm",
                      pathname.startsWith("/admin/spend")
                        ? "bg-ink text-white"
                        : "text-ink/80 hover:bg-white/70",
                    )}
                  >
                    Spend
                  </Link>
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
                    Book requests
                  </Link>
                  <Link
                    href="/admin/working"
                    className={cn(
                      "rounded-xl px-3 py-2 text-sm",
                      pathname.startsWith("/admin/working")
                        ? "bg-ink text-white"
                        : "text-ink/80 hover:bg-white/70",
                    )}
                  >
                    Is Crux working?
                  </Link>
                </>
              ) : null}
            </>
          ) : null}
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-ink/10 bg-paper/95 px-1 py-2 backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-lg items-stretch justify-around text-[11px]">
          {PHONE_TABS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 px-1 py-1",
                navActive(pathname, item.href)
                  ? "font-semibold text-cardinal"
                  : "text-muted",
              )}
            >
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => {
              if (!awake) wake();
              else setDrawerOpen(true);
            }}
            className="flex flex-1 flex-col items-center gap-0.5 px-1 py-1 text-muted"
          >
            <Image
              src="/cruxy/cruxy-curious.png"
              alt=""
              width={20}
              height={20}
              unoptimized
            />
            Cruxy
          </button>
          {me?.session?.adminView ? (
            <Link
              href="/admin"
              className={cn(
                "flex flex-1 flex-col items-center px-1 py-1",
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
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <CruxyProvider>
      <ShellInner>{children}</ShellInner>
    </CruxyProvider>
  );
}
