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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/revision/one-pagers");
        const meta = (await res.json()) as {
          teams?: Team[];
          cases?: CaseRow[];
          error?: string;
        };
        if (!res.ok) {
          setMetaError(meta.error ?? "Could not load cases. Try again.");
          return;
        }
        setTeams(meta.teams ?? []);
        setCases(meta.cases ?? []);
        if (meta.teams?.[0]) setTeamId(meta.teams[0].id);
        if (meta.cases?.[0]) setCaseId(meta.cases[0].id);
      } catch {
        setMetaError("Could not load cases. Try again.");
      }
    })();
  }, []);

  async function start() {
    if (!teamId || !caseId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/revision/socratic", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "start", teamId, caseId }),
      });
      const data = (await res.json()) as {
        session?: SocraticSession;
        error?: string;
      };
      if (!res.ok || !data.session) {
        setError(data.error ?? "Cruxy could not start the drill. Try again.");
        return;
      }
      setSession(data.session);
      setAnswer("");
      setCruxyCase(caseId || null);
      setMood("curious");
    } catch {
      setError("Cruxy could not start the drill. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!session || !answer.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/revision/socratic", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "answer",
          sessionId: session.id,
          answer,
        }),
      });
      const data = (await res.json()) as {
        session?: SocraticSession;
        error?: string;
      };
      if (!res.ok || !data.session) {
        setError(data.error ?? "Cruxy could not continue. Try again.");
        return;
      }
      setSession(data.session);
      setAnswer("");
      if (data.session.status !== "active") setMood("excited");
      else setMood("happy");
    } catch {
      setError("Cruxy could not continue. Try again.");
    } finally {
      setBusy(false);
    }
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

      {metaError ? (
        <div className="space-y-2">
          <p className="text-sm text-cardinal" role="alert">
            {metaError}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            Try again
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Team
            <select
              className="min-h-11 w-full max-w-full rounded-xl border border-ink/15 bg-white/80 px-3 py-2 text-sm text-ink sm:w-auto sm:max-w-md"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              disabled={busy}
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
            Case
            <select
              className="min-h-11 w-full max-w-full rounded-xl border border-ink/15 bg-white/80 px-3 py-2 text-sm text-ink sm:w-auto sm:max-w-md"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              disabled={busy}
            >
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {String(c.number).padStart(2, "0")} {c.title}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            className="self-end"
            disabled={busy || !teamId || !caseId}
            aria-busy={busy}
            onClick={() => void start()}
          >
            {busy && !session ? "Starting…" : "Start drill"}
          </Button>
        </div>
      )}

      {error ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-cardinal" role="alert">
            {error}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void (session ? submit() : start())}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {!session && !metaError ? (
        <p className="text-sm text-muted">
          Pick a case and start. Cruxy asks about the weakest link first.
        </p>
      ) : null}

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
              <label className="block text-xs font-semibold text-muted">
                Your answer
                <textarea
                  className="mt-1 min-h-24 w-full rounded-xl border border-ink/15 p-3 text-sm text-ink"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Try an answer first"
                  disabled={busy}
                />
              </label>
              <Button
                type="button"
                size="sm"
                disabled={busy || !answer.trim()}
                aria-busy={busy}
                onClick={() => void submit()}
              >
                {busy ? "Sending…" : "Answer"}
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
