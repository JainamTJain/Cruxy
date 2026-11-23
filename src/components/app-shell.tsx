"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AccessProvider } from "@/components/access/access-provider";
import { AccessLiveRegions } from "@/components/access/live-region";
import { SkipLink } from "@/components/access/skip-link";
import { SpokenTranscriptHost } from "@/components/access/spoken-transcript";
import { useFocusTrap } from "@/components/access/focus-trap";
import { CruxWordmark } from "@/components/crux-wordmark";
import { CruxyProvider, useCruxy } from "@/components/cruxy/cruxy-context";
import { CruxyDrawer } from "@/components/cruxy/cruxy-drawer";
import { CruxyLamp } from "@/components/cruxy/cruxy-lamp";
import { FloatingCruxy } from "@/components/cruxy/floating-cruxy";
import { preloadCruxyPoses } from "@/components/cruxy/mood/poses";
import { ConfettiHost } from "@/components/motion/confetti";
import { GuidedTour, startGuidedTour } from "@/components/product/guided-tour";
import { ReportProblemButton } from "@/components/help/report-problem-button";
import { NotificationBell } from "@/components/notification-bell";
import {
  GlobalSearchHost,
  SearchOpenButton,
} from "@/components/search/command-palette";
import { registerCruxServiceWorker } from "@/lib/offline/register-sw";
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
  { href: "/today", label: "Today" },
  { href: "/home", label: "Program map" },
  { href: "/revision/roadmap", label: "My roadmap" },
  { href: "/case-brain", label: "Cases" },
  { href: "/practice", label: "Practice" },
  { href: "/team/chat", label: "Team chat" },
];

/** Admin.html sidebar when Admin switch is on and route is under /admin. */
const ADMIN_SIDE_NAV: { href: string; label: string; match?: string }[] = [
  { href: "/practice/admin", label: "Sessions" },
  { href: "/coach", label: "Coach view" },
  { href: "/admin", label: "People and teams" },
  { href: "/admin/flywheel", label: "Program analytics", match: "analytics" },
  { href: "/revision/questions", label: "Question bank" },
  { href: "/today", label: "Back to member view" },
];

const PHONE_TABS = [
  { href: "/today", label: "Today" },
  { href: "/case-brain", label: "Cases" },
  { href: "/practice", label: "Practice" },
  { href: "/team", label: "Team" },
];

function navActive(pathname: string, href: string, match?: string) {
  if (match) return pathname.includes(match);
  if (href === "/today") {
    return pathname === "/today" || pathname.startsWith("/today/");
  }
  if (href === "/home") return pathname === "/home" || pathname === "/";
  if (href === "/practice") {
    return (
      (pathname === "/practice" || pathname.startsWith("/practice/")) &&
      !pathname.includes("/report")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [teamLabel, setTeamLabel] = useState<string | null>(null);
  const [digestPrompt, setDigestPrompt] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { wake, awake, sleep } = useCruxy();

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

  useEffect(() => {
    preloadCruxyPoses();
  }, []);

  useEffect(() => {
    registerCruxServiceWorker();
  }, []);

  async function toggleAdmin(adminView: boolean) {
    await fetch("/api/auth/admin-view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ adminView }),
    });
    await refresh();
    if (adminView && me?.session?.role === "coach_admin") {
      const d = await fetch("/api/auth/digest-opt-in").then((r) => r.json());
      setDigestPrompt(Boolean((d as { prompt?: boolean }).prompt));
    } else {
      setDigestPrompt(false);
    }
    router.push(adminView ? "/coach" : "/today");
  }

  async function answerDigest(optIn: boolean) {
    await fetch("/api/auth/digest-opt-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ digestOptIn: optIn }),
    });
    setDigestPrompt(false);
  }

  const closeDigest = useCallback(() => setDigestPrompt(false), []);
  const digestTrapRef = useFocusTrap({
    active: digestPrompt,
    onEscape: closeDigest,
  });

  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST" });
    router.replace("/sign-in");
  }

  const isAdminRole =
    me?.session?.role === "tech_admin" || me?.session?.role === "coach_admin";
  const displayName = me?.session?.name ?? me?.person?.name ?? "";
  const initial = displayName.slice(0, 1).toUpperCase() || "?";
  const onAdminScreen =
    (Boolean(me?.session?.adminView) && pathname.startsWith("/admin")) ||
    (isAdminRole && pathname.startsWith("/coach"));
  const sideItems = onAdminScreen ? ADMIN_SIDE_NAV : SIDE_NAV;

  // Workstream D: live practice room and thesis drill are full-bleed (no shell chrome).
  const immersive =
    pathname.includes("/practice/rounds/") ||
    pathname.includes("/practice/drills/");

  if (immersive) {
    return (
      <div className="min-h-dvh bg-[#0C0D11]">
        <SkipLink />
        <AccessLiveRegions />
        <SpokenTranscriptHost />
        <div id="main-content">{children}</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-paper text-ink">
      <SkipLink />
      <AccessLiveRegions />
      <aside className="hidden w-[248px] shrink-0 flex-col gap-7 bg-ink px-4 pb-7 pt-[28px] text-white sm:flex">
        <Link href="/home" className="mx-1 inline-block px-1 py-1">
          <CruxWordmark className="text-[38px]" />
        </Link>
        <div data-tour="search">
        <SearchOpenButton
          showShortcut
          className="mx-1 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-left text-sm text-white/80 hover:bg-white/10"
        />
        </div>
        {onAdminScreen ? (
          <span className="ml-3 self-start rounded-md bg-gold px-2 py-1 text-xs font-bold tracking-[0.1em] text-ink">
            ADMIN
          </span>
        ) : null}
        <nav aria-label={onAdminScreen ? "Admin" : "Main"} className="flex flex-col gap-0.5">
          {sideItems.map((item) => {
            const active = onAdminScreen
              ? item.label === "People and teams"
                ? pathname === "/admin" || pathname === "/admin/"
                : item.label === "Program analytics"
                  ? pathname.startsWith("/admin/flywheel") ||
                    pathname.startsWith("/admin/spend") ||
                    pathname.startsWith("/admin/working")
                  : navActive(pathname, item.href, item.match)
              : navActive(pathname, item.href, item.match);
            return (
              <Link
                key={`${item.label}-${item.href}`}
                href={item.href}
                data-tour={`nav-${item.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                className={cn(
                  "rounded-xl px-3 py-2.5 text-[15px] font-medium",
                  active
                    ? "bg-cardinal text-white"
                    : "text-[#C9CCD3] hover:bg-white/10",
                )}
              >
                {item.label}
              </Link>
            );
          })}
          {!onAdminScreen && me?.session?.adminView ? (
            <>
              <div className="my-2 h-px bg-white/10" />
              <Link
                href="/admin"
                className={cn(
                  "rounded-xl px-3 py-2.5 text-[15px] font-medium",
                  pathname.startsWith("/admin")
                    ? "bg-cardinal text-white"
                    : "text-white/80 hover:bg-white/10",
                )}
              >
                Admin console
              </Link>
            </>
          ) : null}
        </nav>
        <div className="relative mt-auto flex flex-col gap-2.5">
          <NotificationBell />
          <button
            type="button"
            data-tour="profile"
            className="flex items-center gap-2.5 rounded-xl px-1.5 py-2 text-left hover:bg-white/10"
            aria-expanded={userMenuOpen}
            aria-haspopup="menu"
            onClick={() => setUserMenuOpen((o) => !o)}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#C2410C] text-sm font-bold">
              {initial}
            </span>
            <span className="text-sm leading-snug">
              <strong>{displayName}</strong>
              <br />
              <span className="text-[#9AA0AA]">
                {teamLabel ?? "Member"}
                {me?.session?.adminView ? (
                  <>
                    <br />
                    Admin
                  </>
                ) : null}
              </span>
            </span>
          </button>
          {userMenuOpen ? (
            <div
              role="menu"
              className="absolute bottom-[4.5rem] left-0 right-0 z-30 flex flex-col gap-0.5 rounded-xl border border-white/10 bg-[#1A1C22] p-1.5 shadow-lg"
            >
              <Link
                role="menuitem"
                href="/progress"
                className="rounded-lg px-3 py-2 text-sm text-white hover:bg-white/10"
                onClick={() => setUserMenuOpen(false)}
              >
                Progress
              </Link>
              <Link
                role="menuitem"
                href="/settings"
                className="rounded-lg px-3 py-2 text-sm text-white hover:bg-white/10"
                onClick={() => setUserMenuOpen(false)}
              >
                Settings
              </Link>
              <Link
                role="menuitem"
                href="/help"
                className="rounded-lg px-3 py-2 text-sm text-white hover:bg-white/10"
                onClick={() => setUserMenuOpen(false)}
              >
                Help
              </Link>
              <Link
                role="menuitem"
                href="/help/whats-new"
                className="rounded-lg px-3 py-2 text-sm text-white hover:bg-white/10"
                onClick={() => setUserMenuOpen(false)}
              >
                What&apos;s new
              </Link>
              <button
                type="button"
                role="menuitem"
                className="rounded-lg px-3 py-2 text-left text-sm text-white hover:bg-white/10"
                onClick={() => {
                  setUserMenuOpen(false);
                  startGuidedTour();
                }}
              >
                Take the tour
              </button>
              {isAdminRole ? (
                <button
                  type="button"
                  role="menuitem"
                  className="rounded-lg px-3 py-2 text-left text-sm text-white hover:bg-white/10"
                  onClick={() => {
                    setUserMenuOpen(false);
                    void toggleAdmin(!me?.session?.adminView);
                  }}
                >
                  {me?.session?.adminView ? "Member view" : "Admin switch"}
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="rounded-lg px-3 py-2 text-left text-sm text-[#C9CCD3] hover:bg-white/10"
                onClick={() => {
                  setUserMenuOpen(false);
                  void signOut();
                }}
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative flex items-center justify-between gap-3 bg-ink px-4 pb-3 pt-4 sm:hidden">
          <Link href="/home" className="inline-block py-0.5">
            <CruxWordmark className="text-2xl" />
          </Link>
          <div className="flex items-center gap-2">
            <span data-tour="search" className="inline-flex">
              <SearchOpenButton className="rounded-lg px-2 py-1 text-sm font-semibold text-white/85 hover:bg-white/10" />
            </span>
            <ReportProblemButton placement="header" />
            <button
              type="button"
              className="text-xs text-white/70 underline"
              aria-expanded={userMenuOpen}
              data-tour="profile"
              onClick={() => setUserMenuOpen((o) => !o)}
            >
              {displayName || "You"}
            </button>
            {userMenuOpen ? (
              <div
                role="menu"
                className="absolute right-3 top-12 z-40 flex min-w-[10rem] flex-col gap-0.5 rounded-xl border border-white/10 bg-[#1A1C22] p-1.5 shadow-lg"
              >
                <Link
                  role="menuitem"
                  href="/progress"
                  className="rounded-lg px-3 py-2 text-sm text-white"
                  onClick={() => setUserMenuOpen(false)}
                >
                  Progress
                </Link>
                <Link
                  role="menuitem"
                  href="/settings"
                  className="rounded-lg px-3 py-2 text-sm text-white"
                  onClick={() => setUserMenuOpen(false)}
                >
                  Settings
                </Link>
                <Link
                  role="menuitem"
                  href="/help"
                  className="rounded-lg px-3 py-2 text-sm text-white"
                  onClick={() => setUserMenuOpen(false)}
                >
                  Help
                </Link>
                <Link
                  role="menuitem"
                  href="/help/whats-new"
                  className="rounded-lg px-3 py-2 text-sm text-white"
                  onClick={() => setUserMenuOpen(false)}
                >
                  What&apos;s new
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  className="rounded-lg px-3 py-2 text-left text-sm text-white"
                  onClick={() => {
                    setUserMenuOpen(false);
                    startGuidedTour();
                  }}
                >
                  Take the tour
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="rounded-lg px-3 py-2 text-left text-sm text-[#C9CCD3]"
                  onClick={() => {
                    setUserMenuOpen(false);
                    void signOut();
                  }}
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </header>
        <div
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 pb-24 pt-4 outline-none sm:px-10 sm:pb-10 sm:pt-8"
        >
          {children}
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-mist bg-paper/95 px-1 py-2 backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-lg items-stretch justify-around text-[11px]">
          {PHONE_TABS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              data-tour={`nav-${item.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
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
              if (awake) sleep();
              else wake();
            }}
            className="flex flex-1 flex-col items-center gap-0.5 px-1 py-1 text-muted"
            data-tour="cruxy"
            aria-label={awake ? "Send Cruxy to rest" : "Call Cruxy"}
          >
            <Image
              src="/cruxy/cruxy-lamp.png"
              alt=""
              width={25}
              height={18}
              className="h-[18px] w-auto object-contain"
              unoptimized
            />
            Cruxy
          </button>
        </div>
      </nav>

      {digestPrompt ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4"
          role="presentation"
        >
          <div
            ref={digestTrapRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="digest-prompt-title"
            className="max-w-md rounded-2xl bg-white p-6 text-ink shadow-xl"
          >
            <h2
              id="digest-prompt-title"
              className="font-display text-xl font-extrabold"
            >
              Weekly summary email?
            </h2>
            <p className="mt-2 text-sm text-muted">
              Dr. B, this is separate from recording consent. Opt in only if you
              want a weekly email about attendance, scores and cases at risk.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="min-h-11 rounded-xl bg-cardinal px-4 py-2 text-sm font-semibold text-white"
                onClick={() => void answerDigest(true)}
              >
                Yes, send it
              </button>
              <button
                type="button"
                className="min-h-11 rounded-xl border border-mist px-4 py-2 text-sm"
                onClick={() => void answerDigest(false)}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <FloatingCruxy />
      <CruxyLamp />
      <CruxyDrawer />
      <ConfettiHost />
      <GuidedTour />
      <SpokenTranscriptHost />
      <GlobalSearchHost />
      <ReportProblemButton />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AccessProvider>
      <CruxyProvider>
        <ShellInner>{children}</ShellInner>
      </CruxyProvider>
    </AccessProvider>
  );
}
