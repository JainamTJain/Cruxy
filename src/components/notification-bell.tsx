"use client";

import { useEffect, useState } from "react";
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

  async function load() {
    const res = await fetch("/api/notifications?unread=0");
    if (!res.ok) return;
    const data = (await res.json()) as {
      notifications: Note[];
      unread: number;
    };
    setNotes(data.notifications.slice(0, 8));
    setUnread(data.unread);
  }

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(t);
  }, []);

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
    <div className="relative">
      <button
        type="button"
        aria-label="Reminders"
        className="relative rounded-lg px-2 py-1 text-sm text-[#9AA0AA] hover:bg-white/10"
        onClick={() => setOpen((v) => !v)}
      >
        Bell
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-cardinal" />
        ) : null}
      </button>
      {open ? (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-mist bg-white p-3 text-ink shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Reminders
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
