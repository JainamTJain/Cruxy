"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AvailabilityPoll, TeamEvent } from "@/lib/team/calendar-types";

type PollView = AvailabilityPoll & {
  votes: { person_id: string; slot_ids: string[] }[];
  tallies: { slotId: string; count: number }[];
  bestSlotId: string | null;
};

type Payload = {
  teamId: string;
  events: TeamEvent[];
  polls: PollView[];
  canManage: boolean;
  subscribeUrl: string;
  me: { id: string; name: string };
};

function fmtWhen(iso: string): string {
  if (iso.length <= 10) {
    return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function monthCells(year: number, month: number): (Date | null)[] {
  const first = new Date(Date.UTC(year, month, 1));
  const startPad = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(Date.UTC(year, month, d)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function TeamCalendarPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"list" | "month">("list");
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() };
  });

  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [place, setPlace] = useState("");
  const [kind, setKind] = useState<"practice" | "round" | "deadline" | "other">(
    "practice",
  );

  const [pollTitle, setPollTitle] = useState("Practice this week");
  const [slotA, setSlotA] = useState("");
  const [slotB, setSlotB] = useState("");
  const [slotC, setSlotC] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/team/calendar");
      if (!res.ok) {
        setStatus("Could not load the calendar.");
        return;
      }
      setData((await res.json()) as Payload);
      setStatus(null);
    } catch {
      setStatus("Could not reach the calendar. Check signal and try again.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, TeamEvent[]>();
    for (const e of data?.events ?? []) {
      const key = e.starts_at.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [data?.events]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/team/calendar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus(err.error ?? "Could not save.");
        return;
      }
      await load();
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    if (status) {
      return (
        <div className="animate-fade-up flex flex-col gap-3 p-4">
          <p className="m-0 text-sm text-cardinal">{status}</p>
          <button
            type="button"
            className="w-fit min-h-11 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white"
            onClick={() => void load()}
          >
            Try again
          </button>
        </div>
      );
    }
    return (
      <div className="animate-fade-up p-4 text-sm text-muted">
        Loading team calendar…
      </div>
    );
  }

  const cells = monthCells(cursor.y, cursor.m);
  const monthLabel = new Date(Date.UTC(cursor.y, cursor.m, 1)).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric", timeZone: "UTC" },
  );

  return (
    <div className="animate-fade-up flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            Team
          </span>
          <h1 className="font-display m-0 text-[40px] font-extrabold leading-none tracking-[-0.02em] max-md:text-[32px]">
            Calendar
          </h1>
          <p className="m-0 max-w-xl text-sm text-muted">
            Practices, round sessions, deadlines and Dec 5 in one place. Subscribe
            so they show up in Google or Apple Calendar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/team"
            className="inline-flex h-10 items-center rounded-xl border border-mist bg-white px-3 text-sm font-semibold"
          >
            Team board
          </Link>
          <Link
            href="/team/roles"
            className="inline-flex h-10 items-center rounded-xl border border-mist bg-white px-3 text-sm font-semibold"
          >
            Roles
          </Link>
        </div>
      </div>

      {status ? <p className="m-0 text-sm text-muted">{status}</p> : null}

      {/* Subscribe */}
      <section className="rounded-[20px] bg-white p-4">
        <h2 className="font-display m-0 text-lg font-extrabold">
          Subscribe on your phone
        </h2>
        <p className="mt-1 text-sm text-muted">
          Private link for you only. Paste it into Google Calendar or Apple
          Calendar as a subscription.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            readOnly
            className="h-10 min-w-0 flex-1 rounded-xl border border-mist bg-[#F7F8FA] px-3 text-xs text-ink"
            value={data.subscribeUrl}
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            className="h-10 shrink-0 rounded-xl bg-ink px-4 text-sm font-semibold text-white"
            onClick={() => {
              void navigator.clipboard.writeText(data.subscribeUrl);
              setStatus("Subscribe link copied.");
            }}
          >
            Copy link
          </button>
          <button
            type="button"
            disabled={busy}
            className="h-10 shrink-0 rounded-xl border border-mist px-4 text-sm font-semibold"
            onClick={() => void post({ action: "rotate_token" })}
          >
            New private link
          </button>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`h-9 rounded-xl px-3 text-xs font-semibold ${
            view === "list" ? "bg-ink text-white" : "border border-mist bg-white"
          }`}
          onClick={() => setView("list")}
        >
          List
        </button>
        <button
          type="button"
          className={`h-9 rounded-xl px-3 text-xs font-semibold ${
            view === "month" ? "bg-ink text-white" : "border border-mist bg-white"
          }`}
          onClick={() => setView("month")}
        >
          Month
        </button>
      </div>

      {view === "list" ? (
        <section className="overflow-hidden rounded-[20px] bg-white">
          <ul className="m-0 list-none divide-y divide-[#ECEEF1] p-0">
            {data.events.map((e) => (
              <li
                key={e.id}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold text-ink">{e.title}</p>
                  <p className="m-0 mt-0.5 text-[12px] text-muted">
                    {fmtWhen(e.starts_at)}
                    {e.place ? `, ${e.place}` : ""}
                    {e.online ? ", online" : ""}
                    {e.kind === "deadline" ? ", deadline" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {e.practice_session_id ? (
                    <Link
                      href={`/practice/sessions/${e.practice_session_id}`}
                      className="text-sm font-semibold text-cardinal underline"
                    >
                      Take attendance
                    </Link>
                  ) : null}
                  {e.source === "team" ? (
                    <span className="text-[11px] text-muted">Team event</span>
                  ) : null}
                </div>
              </li>
            ))}
            {!data.events.length ? (
              <li className="px-4 py-6 text-sm text-muted">
                No events yet. Add a practice or start an availability poll.
              </li>
            ) : null}
          </ul>
        </section>
      ) : (
        <section className="rounded-[20px] bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              className="text-sm font-semibold text-muted"
              onClick={() =>
                setCursor((c) => {
                  const d = new Date(Date.UTC(c.y, c.m - 1, 1));
                  return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
                })
              }
            >
              Previous
            </button>
            <h2 className="font-display m-0 text-lg font-extrabold">
              {monthLabel}
            </h2>
            <button
              type="button"
              className="text-sm font-semibold text-muted"
              onClick={() =>
                setCursor((c) => {
                  const d = new Date(Date.UTC(c.y, c.m + 1, 1));
                  return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
                })
              }
            >
              Next
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) {
                return <div key={`e-${i}`} className="min-h-[64px]" />;
              }
              const key = dayKey(d);
              const evs = byDay.get(key) ?? [];
              return (
                <div
                  key={key}
                  className="min-h-[64px] rounded-lg border border-[#ECEEF1] bg-[#F7F8FA] p-1 text-left"
                >
                  <div className="text-[11px] font-bold text-ink">
                    {d.getUTCDate()}
                  </div>
                  {evs.slice(0, 2).map((e) => (
                    <div
                      key={e.id}
                      className="mt-0.5 truncate text-[10px] font-medium text-cardinal"
                      title={e.title}
                    >
                      {e.title}
                    </div>
                  ))}
                  {evs.length > 2 ? (
                    <div className="text-[10px] text-muted">+{evs.length - 2}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Availability polls */}
      <section className="flex flex-col gap-3 rounded-[20px] bg-white p-4">
        <h2 className="font-display m-0 text-lg font-extrabold">
          Availability polls
        </h2>
        <p className="m-0 text-sm text-muted">
          A lead proposes a few times. Tap the ones that work. The best time is
          highlighted, then becomes a calendar event in one tap.
        </p>

        {data.polls.map((p) => {
          const myVote = p.votes.find((v) => v.person_id === data.me.id);
          return (
            <div
              key={p.id}
              className="rounded-2xl border border-[#ECEEF1] p-3"
            >
              <p className="m-0 text-sm font-semibold">{p.title}</p>
              <ul className="mt-2 flex list-none flex-col gap-2 p-0">
                {p.slots.map((s) => {
                  const tally =
                    p.tallies.find((t) => t.slotId === s.id)?.count ?? 0;
                  const best = p.bestSlotId === s.id;
                  const picked = myVote?.slot_ids.includes(s.id);
                  return (
                    <li
                      key={s.id}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm ${
                        best ? "bg-[#E6F4F1]" : "bg-[#F7F8FA]"
                      }`}
                    >
                      <button
                        type="button"
                        disabled={busy || Boolean(p.resulting_event_id)}
                        className="text-left font-semibold disabled:opacity-60"
                        onClick={() => {
                          const next = new Set(myVote?.slot_ids ?? []);
                          if (next.has(s.id)) next.delete(s.id);
                          else next.add(s.id);
                          void post({
                            action: "vote_poll",
                            pollId: p.id,
                            slotIds: [...next],
                          });
                        }}
                      >
                        {picked ? "✓ " : ""}
                        {fmtWhen(s.starts_at)}
                        {best ? " (best so far)" : ""}
                      </button>
                      <span className="text-xs text-muted">
                        {tally} {tally === 1 ? "person" : "people"}
                      </span>
                      {data.canManage && best && !p.resulting_event_id ? (
                        <button
                          type="button"
                          disabled={busy}
                          className="h-8 rounded-lg bg-cardinal px-3 text-xs font-semibold text-white"
                          onClick={() =>
                            void post({
                              action: "lock_poll",
                              pollId: p.id,
                              slotId: s.id,
                            })
                          }
                        >
                          Make this an event
                        </button>
                      ) : null}
                      {p.resulting_event_id && best ? (
                        <span className="text-xs font-semibold text-[#0F7B6C]">
                          Saved on the calendar
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        {data.canManage ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-semibold text-muted sm:col-span-2">
              Poll title
              <input
                className="mt-1 block h-10 w-full rounded-xl border border-mist px-3 text-sm text-ink"
                value={pollTitle}
                onChange={(e) => setPollTitle(e.target.value)}
              />
            </label>
            <label className="text-xs font-semibold text-muted">
              Time A
              <input
                type="datetime-local"
                className="mt-1 block h-10 w-full rounded-xl border border-mist px-3 text-sm text-ink"
                value={slotA}
                onChange={(e) => setSlotA(e.target.value)}
              />
            </label>
            <label className="text-xs font-semibold text-muted">
              Time B
              <input
                type="datetime-local"
                className="mt-1 block h-10 w-full rounded-xl border border-mist px-3 text-sm text-ink"
                value={slotB}
                onChange={(e) => setSlotB(e.target.value)}
              />
            </label>
            <label className="text-xs font-semibold text-muted sm:col-span-2">
              Time C (optional)
              <input
                type="datetime-local"
                className="mt-1 block h-10 w-full rounded-xl border border-mist px-3 text-sm text-ink"
                value={slotC}
                onChange={(e) => setSlotC(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={busy || !slotA || !slotB}
              className="h-10 w-fit rounded-xl bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2"
              onClick={() => {
                const slots = [
                  { startsAt: new Date(slotA).toISOString() },
                  { startsAt: new Date(slotB).toISOString() },
                ];
                if (slotC) {
                  slots.push({ startsAt: new Date(slotC).toISOString() });
                }
                void post({
                  action: "create_poll",
                  title: pollTitle,
                  slots,
                }).then(() => {
                  setSlotA("");
                  setSlotB("");
                  setSlotC("");
                });
              }}
            >
              Start poll
            </button>
          </div>
        ) : null}
      </section>

      {/* Add event */}
      {data.canManage ? (
        <section className="flex flex-col gap-3 rounded-[20px] bg-white p-4">
          <h2 className="font-display m-0 text-lg font-extrabold">Add event</h2>
          <p className="m-0 text-sm text-muted">
            Dr. B and case leads can add practices, rounds and deadlines.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-semibold text-muted sm:col-span-2">
              Title
              <input
                className="mt-1 block h-10 w-full rounded-xl border border-mist px-3 text-sm text-ink"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Team 3 practice"
              />
            </label>
            <label className="text-xs font-semibold text-muted">
              When
              <input
                type="datetime-local"
                className="mt-1 block h-10 w-full rounded-xl border border-mist px-3 text-sm text-ink"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </label>
            <label className="text-xs font-semibold text-muted">
              Kind
              <select
                className="mt-1 block h-10 w-full rounded-xl border border-mist px-3 text-sm text-ink"
                value={kind}
                onChange={(e) =>
                  setKind(e.target.value as typeof kind)
                }
              >
                <option value="practice">Practice</option>
                <option value="round">Round session</option>
                <option value="deadline">Deadline</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-muted sm:col-span-2">
              Place (optional)
              <input
                className="mt-1 block h-10 w-full rounded-xl border border-mist px-3 text-sm text-ink"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={busy || !title.trim() || !startsAt}
              className="h-10 w-fit rounded-xl bg-cardinal px-4 text-sm font-semibold text-white disabled:opacity-50"
              onClick={() =>
                void post({
                  action: "create_event",
                  title,
                  kind,
                  startsAt: new Date(startsAt).toISOString(),
                  place: place || null,
                }).then(() => {
                  setTitle("");
                  setStartsAt("");
                  setPlace("");
                })
              }
            >
              Save event
            </button>
          </div>
        </section>
      ) : null}

      <p className="m-0 text-sm text-muted">
        After a round, send a teammate a short note from{" "}
        <Link href="/team/kudos" className="font-semibold text-cardinal underline">
          Kudos
        </Link>
        .
      </p>
    </div>
  );
}
