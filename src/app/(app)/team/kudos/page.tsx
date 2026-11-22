"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PeerKudos } from "@/lib/team/calendar-types";

type Person = { id: string; name: string };

export default function KudosPage() {
  const [kudos, setKudos] = useState<PeerKudos[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [meId, setMeId] = useState("");
  const [toPersonId, setToPersonId] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const names = Object.fromEntries(people.map((p) => [p.id, p.name]));

  const load = useCallback(async () => {
    const [kRes, pRes, meRes] = await Promise.all([
      fetch("/api/team/kudos"),
      fetch("/api/auth/people"),
      fetch("/api/auth/me"),
    ]);
    let teamId: string | null = null;
    if (meRes.ok) {
      const me = (await meRes.json()) as {
        person?: { id?: string; team_id?: string | null };
      };
      teamId = me.person?.team_id ?? null;
      if (me.person?.id) setMeId(me.person.id);
    }
    if (kRes.ok) {
      const d = (await kRes.json()) as {
        kudos: PeerKudos[];
        meId: string;
        teamId?: string;
      };
      setKudos(d.kudos ?? []);
      setMeId(d.meId);
      if (d.teamId) teamId = d.teamId;
    }
    if (pRes.ok) {
      const d = (await pRes.json()) as {
        people?: (Person & { team_id?: string | null })[];
      };
      const list = (d.people ?? []).filter((p) =>
        teamId ? p.team_id === teamId : true,
      );
      setPeople(list.map((p) => ({ id: p.id, name: p.name })));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    if (!toPersonId || !note.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/team/kudos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toPersonId, note }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus(err.error ?? "Could not send.");
        return;
      }
      setNote("");
      setStatus("Note sent. They will see it in notifications and on Progress.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-up flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
          Team
        </span>
        <h1 className="font-display m-0 text-[40px] font-extrabold leading-none tracking-[-0.02em] max-md:text-[32px]">
          Kudos
        </h1>
        <p className="m-0 max-w-xl text-sm text-muted">
          After a round, send a short note to a teammate. No ranking and no
          leaderboard. Notes show in notifications and on Progress.
        </p>
      </div>

      {status ? <p className="m-0 text-sm text-muted">{status}</p> : null}

      <section className="flex flex-col gap-3 rounded-[20px] bg-white p-4">
        <h2 className="font-display m-0 text-lg font-extrabold">Send a note</h2>
        <label className="text-xs font-semibold text-muted">
          Teammate
          <select
            className="mt-1 block h-10 w-full max-w-md rounded-xl border border-mist px-3 text-sm text-ink"
            value={toPersonId}
            onChange={(e) => setToPersonId(e.target.value)}
          >
            <option value="">Pick someone</option>
            {people
              .filter((p) => p.id !== meId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-muted">
          Note
          <textarea
            className="mt-1 block min-h-[88px] w-full max-w-xl rounded-xl border border-mist px-3 py-2 text-sm text-ink"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="You handled that judge question clearly."
          />
        </label>
        <button
          type="button"
          disabled={busy || !toPersonId || !note.trim()}
          className="h-10 w-fit rounded-xl bg-cardinal px-4 text-sm font-semibold text-white disabled:opacity-50"
          onClick={() => void send()}
        >
          Send note
        </button>
      </section>

      <section className="rounded-[20px] bg-white p-4">
        <h2 className="font-display m-0 text-lg font-extrabold">
          Recent on the team
        </h2>
        <ul className="mt-3 m-0 list-none divide-y divide-[#ECEEF1] p-0">
          {kudos.map((k) => (
            <li key={k.id} className="py-3 text-sm">
              <p className="m-0 font-semibold text-ink">
                {names[k.from_person_id] ?? "Teammate"} to{" "}
                {names[k.to_person_id] ?? "teammate"}
              </p>
              <p className="m-0 mt-1 text-muted">{k.body}</p>
              <p className="m-0 mt-1 text-[11px] text-muted">
                {new Date(k.created_at).toLocaleString()}
              </p>
            </li>
          ))}
          {!kudos.length ? (
            <li className="py-4 text-sm text-muted">
              No notes yet. Be the first after practice.
            </li>
          ) : null}
        </ul>
      </section>

      <p className="m-0 text-sm text-muted">
        <Link href="/progress" className="font-semibold text-cardinal underline">
          Open Progress
        </Link>{" "}
        to see notes sent to you.
      </p>
    </div>
  );
}
