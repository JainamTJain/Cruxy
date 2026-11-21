"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type CaseRow = { id: string; number: number; title: string; active: boolean };
type Team = { id: string; name: string };

export default function AdminSessionBuilderPage() {
  const router = useRouter();
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [title, setTitle] = useState("Tuesday practice");
  const [place, setPlace] = useState("THH 209");
  const [online, setOnline] = useState(false);
  const [caseId, setCaseId] = useState("");
  const [presenting, setPresenting] = useState("");
  const [commenting, setCommenting] = useState("");
  const [cruxyJudge, setCruxyJudge] = useState(true);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/practice/sessions")
      .then((r) => r.json())
      .then((d) => {
        const active = (d.cases ?? []).filter((c: CaseRow) => c.active);
        setCases(active);
        setTeams(d.teams ?? []);
        if (active[0]) setCaseId(active[0].id);
        if (d.teams?.[0]) setPresenting(d.teams[0].id);
        if (d.teams?.[1]) setCommenting(d.teams[1].id);
      });
  }, []);

  async function create() {
    setError(null);
    const caseRow = cases.find((c) => c.id === caseId);
    const res = await fetch("/api/practice/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "admin",
        title,
        place: online ? null : place,
        online,
        rounds: [
          {
            caseId,
            caseNumber: caseRow?.number ?? null,
            teamIds: [presenting, commenting].filter(Boolean),
            sides: { presenting, commenting: commenting || null },
            moderator: "cruxy",
            judges: { humans: [], cruxy: cruxyJudge },
            mode: "full_round",
          },
        ],
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not create (need admin view?)");
      return;
    }
    setCode(data.session?.code ?? null);
    if (data.session?.id) {
      router.push(`/practice/sessions/${data.session.id}`);
    }
  }

  return (
    <main className="animate-fade-up mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Admin session</h1>
        <p className="mt-1 text-sm text-muted">
          Date, place, rounds, moderator, judges. Code shown only here.
        </p>
      </div>

      <label className="block text-sm">
        Title
        <input
          className="mt-1 w-full rounded-xl border border-ink/15 px-3 py-2"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={online}
          onChange={(e) => setOnline(e.target.checked)}
        />
        Online
      </label>
      {!online ? (
        <label className="block text-sm">
          Place
          <input
            className="mt-1 w-full rounded-xl border border-ink/15 px-3 py-2"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
          />
        </label>
      ) : null}

      <label className="block text-sm">
        Case
        <select
          className="mt-1 w-full rounded-xl border border-ink/15 px-3 py-2"
          value={caseId}
          onChange={(e) => setCaseId(e.target.value)}
        >
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.number}. {c.title}
            </option>
          ))}
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Presenting
          <select
            className="mt-1 w-full rounded-xl border border-ink/15 px-3 py-2"
            value={presenting}
            onChange={(e) => setPresenting(e.target.value)}
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Commenting
          <select
            className="mt-1 w-full rounded-xl border border-ink/15 px-3 py-2"
            value={commenting}
            onChange={(e) => setCommenting(e.target.value)}
          >
            <option value="">Cruxy / none</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={cruxyJudge}
          onChange={(e) => setCruxyJudge(e.target.checked)}
        />
        Cruxy judge (required when no human judge)
      </label>

      {error ? <p className="text-sm text-cardinal">{error}</p> : null}
      {code ? (
        <p className="rounded-xl bg-gold/20 px-3 py-2 font-mono text-lg tracking-widest">
          Session code: {code}
        </p>
      ) : null}

      <Button type="button" onClick={() => void create()}>
        Create session
      </Button>
    </main>
  );
}
