"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageIntro } from "@/components/page-intro";
import { Button } from "@/components/ui/button";
import { KIND_LABELS, bucketForStoredKind } from "@/lib/notify/kinds";

type Note = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

export default function NotificationsPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/notifications?unread=0");
    if (!res.ok) return;
    const data = (await res.json()) as {
      notifications: Note[];
      unread: number;
    };
    setNotes(data.notifications);
    setUnread(data.unread);
  }

  useEffect(() => {
    void load();
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
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
    setMsg(res.ok ? "All marked read." : "Could not mark all read.");
    void load();
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageIntro eyebrow="Reach" title="Notifications">
        Mentions, roles, practice starts, Brief suggestions and Dec 5 reminders.
        Change what reaches you in Settings.
      </PageIntro>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted">
          {unread === 0
            ? "Nothing unread."
            : `${unread} unread`}
        </p>
        <Button
          type="button"
          variant="outline"
          className="h-10"
          onClick={() => void markAll()}
          disabled={unread === 0}
        >
          Mark all read
        </Button>
        <Link
          href="/settings#alerts"
          className="text-sm font-medium text-cardinal underline"
        >
          Alert settings
        </Link>
      </div>
      {msg ? <p className="text-sm text-muted">{msg}</p> : null}

      {notes.length === 0 ? (
        <p className="rounded-2xl bg-white px-5 py-8 text-sm text-muted">
          When something needs you, it shows up here.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((n) => {
            const bucket = bucketForStoredKind(n.kind);
            const label = bucket ? KIND_LABELS[bucket] : null;
            return (
              <li
                key={n.id}
                className={`rounded-2xl border px-4 py-3 ${
                  n.read_at
                    ? "border-mist bg-white"
                    : "border-cardinal/30 bg-[#FFF8F8]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {label ? (
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                        {label}
                      </p>
                    ) : null}
                    <p className="font-semibold text-ink">{n.title}</p>
                    {n.body ? (
                      <p className="mt-1 text-sm text-muted">{n.body}</p>
                    ) : null}
                    <p className="mt-2 text-[11px] text-muted">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </div>
                  {!n.read_at ? (
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-cardinal" />
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  {n.href ? (
                    <Link href={n.href} className="font-medium text-cardinal underline">
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
            );
          })}
        </ul>
      )}
    </div>
  );
}
