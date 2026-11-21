"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCruxy } from "@/components/cruxy/cruxy-context";
import type { SocraticSession } from "@/lib/revision/types";
import type { CaseRow, Team } from "@/lib/types";

export default function SocraticPage() {
  const { setMood, setCaseId: setCruxyCase } = useCruxy();
  const [teams, setTeams] = useState<Team[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [teamId, setTeamId] = useState("");
  const [caseId, setCaseId] = useState("");
  const [session, setSession] = useState<SocraticSession | null>(null);
  const [answer, setAnswer] = useState("");

  useEffect(() => {
    void (async () => {
      const meta = await fetch("/api/revision/one-pagers").then((r) => r.json());
      setTeams(meta.teams ?? []);
      setCases(meta.cases ?? []);
      if (meta.teams?.[0]) setTeamId(meta.teams[0].id);
      if (meta.cases?.[0]) setCaseId(meta.cases[0].id);
    })();
  }, []);

  async function start() {
    const res = await fetch("/api/revision/socratic", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "start", teamId, caseId }),
    });
    const data = (await res.json()) as { session: SocraticSession };
    setSession(data.session);
    setAnswer("");
    setCruxyCase(caseId || null);
    setMood("curious");
  }

  async function submit() {
    if (!session) return;
    const res = await fetch("/api/revision/socratic", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "answer",
        sessionId: session.id,
        answer,
      }),
    });
    const data = (await res.json()) as { session: SocraticSession };
    setSession(data.session);
    setAnswer("");
    if (data.session.status !== "active") setMood("excited");
    else setMood("happy");
  }

  const summaryLines = session?.summary?.split("\n").filter(Boolean) ?? [];

  return (
    <main className="animate-fade-up space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Socratic drills</h1>
        <p className="mt-1 text-sm text-muted">
          One question at a time on the weakest claim-map link. Summary links back to
          the map.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          className="rounded-xl border border-ink/15 bg-white/80 px-3 py-2 text-sm"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          className="rounded-xl border border-ink/15 bg-white/80 px-3 py-2 text-sm"
          value={caseId}
          onChange={(e) => setCaseId(e.target.value)}
        >
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {String(c.number).padStart(2, "0")} {c.title}
            </option>
          ))}
        </select>
        <Button type="button" onClick={() => void start()}>
          Start drill
        </Button>
      </div>

      {session ? (
        <div className="space-y-3 rounded-2xl border border-ink/10 bg-white/70 p-4">
          {session.turns.map((t, i) => (
            <div
              key={i}
              className={
                t.role === "cruxy"
                  ? "rounded-xl bg-ink/5 px-3 py-2 text-sm"
                  : "rounded-xl bg-gold/15 px-3 py-2 text-sm"
              }
            >
              <p className="text-[10px] uppercase tracking-wide text-muted">
                {t.role === "cruxy" ? "Cruxy" : "You"}
              </p>
              <p>{t.text}</p>
            </div>
          ))}
          {session.status === "active" ? (
            <div className="space-y-2">
              <textarea
                className="min-h-24 w-full rounded-xl border border-ink/15 p-3 text-sm"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Try an answer first"
              />
              <Button type="button" size="sm" onClick={() => void submit()}>
                Answer
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border border-cardinal/20 bg-cardinal/5 p-3 text-sm">
              <p className="font-medium">3-line summary</p>
              <ul className="mt-2 space-y-1 text-muted">
                {summaryLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href={`/case-brain/${session.case_id}`}
                  className="text-xs font-medium text-cardinal underline"
                >
                  Open claim map
                </Link>
                {session.claim_links.length ? (
                  <span className="text-xs text-muted">
                    {session.claim_links.length} linked claim
                    {session.claim_links.length === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-xs text-muted">
                Cruxy will check whether your next try on these claims improves
                (drill answer, flashcard or round score). See Settings for your
                outcomes.
              </p>
            </div>
          )}
        </div>
      ) : null}
    </main>
  );
}