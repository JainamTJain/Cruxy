"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Note = {
  id: string;
  kind?: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  payload?: Record<string, unknown>;
};

/** In-app reminders (F-074). Full list lives on /notifications. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/notifications?unread=0");
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications: Note[];
        unread: number;
      };
      setNotes(data.notifications.slice(0, 8));
      setUnread(data.unread);
    } catch {
      /* bell is best-effort; full page has the error state */
    }
  }

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    void load();
  }

  async function markAll() {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
    void load();
  }

  async function approveReset(n: Note) {
    const requestId =
      typeof n.payload?.requestId === "string" ? n.payload.requestId : null;
    if (!requestId) return;
    setBusyId(n.id);
    await fetch("/api/auth/forgot-passcode/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId, notificationId: n.id }),
    });
    setBusyId(null);
    void load();
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label={unread > 0 ? `Notifications, ${unread} new` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative flex min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[#C9CCD3] hover:bg-white/10"
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4 4a2 2 0 0 0 4 0"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>Notifications</span>
        {unread > 0 ? (
          <span className="rounded-full bg-cardinal px-1.5 text-[11px] font-bold text-white">
            {unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute bottom-full left-0 z-50 mb-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-mist bg-white p-3 text-ink shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Notifications
            </p>
            {unread > 0 ? (
              <button
                type="button"
                className="text-[11px] text-muted underline"
                onClick={() => void markAll()}
              >
                Mark all read
              </button>
            ) : null}
          </div>
          {notes.length === 0 ? (
            <p className="text-sm text-muted">Nothing waiting.</p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto">
              {notes.map((n) => (
                <li key={n.id} className="rounded-lg bg-paper px-2 py-2 text-sm">
                  <p className="font-medium">{n.title}</p>
                  {n.body ? (
                    <p className="mt-0.5 text-xs text-muted">{n.body}</p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    {n.kind === "passcode_reset_request" && !n.read_at ? (
                      <button
                        type="button"
                        disabled={busyId === n.id}
                        className="font-semibold text-cardinal underline disabled:opacity-50"
                        onClick={() => void approveReset(n)}
                      >
                        {busyId === n.id ? "Approving…" : "Approve reset"}
                      </button>
                    ) : null}
                    {n.href ? (
                      <Link href={n.href} className="text-cardinal underline">
                        Open
                      </Link>
                    ) : null}
                    {!n.read_at ? (
                      <button
                        type="button"
                        className="text-muted underline"
                        onClick={() => void markRead(n.id)}
                      >
                        Mark read
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/notifications"
            className="mt-3 block text-center text-xs font-semibold text-cardinal underline"
            onClick={() => setOpen(false)}
          >
            See all notifications
          </Link>
        </div>
      ) : null}
    </div>
  );
}
