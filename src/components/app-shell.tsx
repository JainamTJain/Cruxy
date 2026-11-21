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
  person?: {
    name: string;
    team_id: string | null;
  } | null;
  dataMode?: string;
  teamName?: string | null;
};

const SIDE_NAV: { href: string; label: string; match?: string }[] = [
  { href: "/home", label: "Program map" },
  { href: "/revision/roadmap", label: "My roadmap" },
  { href: "/case-brain", label: "Cases" },
  { href: "/library", label: "Reading room" },
  { href: "/practice", label: "Practice" },
  { href: "/practice", label: "Reports", match: "/report" },
  { href: "/team/chat", label: "Team chat" },
];

const PHONE_TABS = [
  { href: "/home", label: "Today" },
  { href: "/case-brain", label: "Cases" },
  { href: "/practice", label: "Practice" },
  { href: "/team", label: "Team" },
];

function navActive(pathname: string, href: string, match?: string) {
  if (match) return pathname.includes(match);
  if (href === "/home") return pathname === "/home" || pathname === "/";
  if (href === "/practice") {
    return (
      (pathname === "/practice" || pathname.startsWith("/practice/")) &&
      !pathname.includes("/report")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function AskCruxyButton({ className }: { className?: string }) {
  const { wake, setDrawerOpen, awake } = useCruxy();
  return (
    <button
      type="button"
      onClick={() => {
        if (!awake) wake();
        else setDrawerOpen(true);
      }}
      className={cn(
        "flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gold text-[15px] font-bold text-ink",
        className,
      )}
    >
      <Image
        src="/cruxy/cruxy-lamp.png"
        alt=""
        width={28}
        height={28}
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
  const [teamLabel, setTeamLabel] = useState<string | null>(null);
  const { wake, setDrawerOpen, awake } = useCruxy();

  async function refresh() {
    const res = await fetch("/api/auth/me");
    const data = (await res.json()) as Me;
    if (!data.authenticated) {
      router.replace("/sign-in");
      return;
    }
    setMe(data);
    if (data.session?.teamId || data.person?.team_id) {
      const people = await fetch("/api/auth/people").then((r) => r.json());
      const tid = data.session?.teamId ?? data.person?.team_id;
      const team = (people.teams as { id: string; name: string }[] | undefined)?.find(
        (t) => t.id === tid,
      );
      setTeamLabel(team?.name ?? null);
    }
  }

  useEffect(() => {
    void refresh();
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
  const displayName = me?.session?.name ?? me?.person?.name ?? "";
  const initial = displayName.slice(0, 1).toUpperCase() || "·";

  return (
    <div className="flex min-h-dvh bg-paper text-ink">
      <aside className="hidden w-[248px] shrink-0 flex-col gap-7 bg-ink px-4 pb-7 pt-[28px] text-white sm:flex">
        <Link
          href="/home"
          className="font-display px-3 text-[38px] font-extrabold leading-none tracking-[-0.04em] text-white"
        >
          crux
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {SIDE_NAV.map((item) => {
            const active = navActive(pathname, item.href, item.match);
            return (
              <Link
                key={`${item.label}-${item.href}`}
                href={item.href}
                className={cn(
                  "rounded-xl px-3 py-2.5 text-[15px] font-medium",
                  active
                    ? "bg-cardinal text-white"
                    : "text-white/80 hover:bg-white/10",
                )}
              >
                {item.label}
              </Link>
            );
          })}
          {me?.session?.adminView ? (
            <>
              <div className="my-2 h-px bg-white/10" />
              <Link
                href="/admin"
                className={cn(
                  "rounded-xl px-3 py-2.5 text-[15px] font-medium",
                  pathname === "/admin"
                    ? "bg-cardinal text-white"
                    : "text-white/80 hover:bg-white/10",
                )}
              >
                Admin console
              </Link>
              {me.session.role === "tech_admin" ? (
                <Link
                  href="/admin/passcodes"
                  className={cn(
                    "rounded-xl px-3 py-2.5 text-[15px] font-medium",
                    pathname.startsWith("/admin/passcodes")
                      ? "bg-cardinal text-white"
                      : "text-white/80 hover:bg-white/10",
                  )}
                >
                  Passcodes
                </Link>
              ) : null}
            </>
          ) : null}
        </nav>
        <div className="mt-auto flex flex-col gap-2.5">
          <AskCruxyButton />
          <div className="flex items-center gap-2.5 px-1.5 py-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#C2410C] text-sm font-bold">
              {initial}
            </span>
            <span className="text-sm leading-snug">
              <strong>{displayName}</strong>
              <br />
              <span className="text-[#9AA0AA]">
                {teamLabel ?? "Member"}
                {me?.session?.adminView ? " · admin" : ""}
              </span>
            </span>
          </div>
          <div className="flex gap-2 px-1">
            {isAdminRole ? (
              <button
                type="button"
                onClick={() => void toggleAdmin(!me?.session?.adminView)}
                className="text-[11px] text-[#9AA0AA] underline"
              >
                {me?.session?.adminView ? "Member view" : "Admin switch"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void signOut()}
              className="text-[11px] text-[#9AA0AA] underline"
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-4 sm:hidden">
          <Link
            href="/home"
            className="font-display text-2xl font-extrabold tracking-tight text-cardinal"
          >
            crux
          </Link>
          <p className="text-xs text-muted">
            {displayName}
            {me?.dataMode === "sample" ? " · sample" : ""}
          </p>
        </header>
        <main className="min-w-0 flex-1 px-4 pb-24 pt-4 sm:px-10 sm:pb-10 sm:pt-8">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-mist bg-paper/95 px-1 py-2 backdrop-blur sm:hidden">
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
              src="/cruxy/cruxy-lamp.png"
              alt=""
              width={18}
              height={18}
              unoptimized
            />
            Cruxy
          </button>
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
