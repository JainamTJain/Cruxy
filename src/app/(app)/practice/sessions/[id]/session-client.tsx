"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Round = {
  id: string;
  mode: string;
  phase: string;
  case_number: number | null;
  judges: { humans: string[]; cruxy: boolean };
  team_ids: string[];
};

export function SessionClient() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const screen = search.get("screen");
  const [session, setSession] = useState<{
    id: string;
    title: string;
    kind: string;
    status: string;
    date: string;
    place: string | null;
    online: boolean;
    rounds: Round[];
  } | null>(null);
  const [attendance, setAttendance] = useState<
    { person_id: string; status: string; source: string }[]
  >([]);
  const [admin, setAdmin] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(`/api/practice/sessions/${params.id}`);
    const data = await res.json();
    if (res.ok) {
      setSession(data.session);
      setAttendance(data.attendance ?? []);
      setAdmin(Boolean(data.admin));
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function imHere() {
    await fetch("/api/practice/attendance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionId: params.id,
        status: "present",
        source: "self",
      }),
    });
    setMsg("Marked present.");
    await refresh();
  }

  async function rotateCode() {
    const res = await fetch(`/api/practice/sessions/${params.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "rotate_code" }),
    });
    const data = await res.json();
    if (res.ok) setCode(data.code);
  }

  if (!session) {
    return <p className="text-sm text-muted">Loading session…</p>;
  }

  return (
    <main className="animate-fade-up space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">
          {session.kind} · {session.status}
          {screen ? ` · you: ${screen}` : ""}
        </p>
        <h1 className="font-display text-3xl font-semibold">{session.title}</h1>
        <p className="mt-1 text-sm text-muted">
          {session.date}
          {session.online ? " · online" : session.place ? ` · ${session.place}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void imHere()}>
          I&apos;m here
        </Button>
        {admin ? (
          <Button type="button" variant="gold" onClick={() => void rotateCode()}>
            Show / rotate code
          </Button>
        ) : null}
        <Link href="/judging">
          <Button type="button" variant="secondary">
            Judging portal
          </Button>
        </Link>
      </div>
      {code ? (
        <p className="rounded-xl bg-gold/20 px-3 py-2 font-mono text-xl tracking-[0.3em]">
          {code}
        </p>
      ) : null}
      {msg ? <p className="text-sm">{msg}</p> : null}

      <section>
        <h2 className="font-display text-xl font-semibold">Rounds</h2>
        <ul className="mt-3 space-y-2">
          {session.rounds.map((r) => (
            <li key={r.id}>
              <Link
                href={`/practice/rounds/${r.id}`}
                className="block rounded-xl border border-ink/10 bg-white/70 px-4 py-3 hover:bg-white"
              >
                <span className="font-medium">
                  Case {r.case_number ?? "—"} · {r.mode}
                </span>
                <span className="ml-2 text-xs text-muted">
                  phase {r.phase}
                  {r.judges.cruxy ? " · Cruxy judge" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-lg font-semibold">Attendance</h2>
        <p className="text-sm text-muted">{attendance.length} marked</p>
        <ul className="mt-2 space-y-1 text-sm">
          {attendance.map((a) => (
            <li key={a.person_id} className="font-mono text-xs">
              {a.person_id.slice(0, 8)}… · {a.status} · {a.source}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
