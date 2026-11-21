"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Note = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
};

/** In-app reminders (F-074). Reminders still go here while Cruxy sleeps. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);

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
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Reminders
          </p>
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
                  <div className="mt-1 flex gap-2 text-xs">
                    {n.href ? (
                      <Link href={n.href} className="text-cardinal underline">
                        Open
                      </Link>
                    ) : null}
                    {!n.read_at ? (
                      <button
                        type="button"
                        className="underline text-muted"
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
        </div>
      ) : null}
    </div>
  );
}
