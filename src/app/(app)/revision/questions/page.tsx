"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ModeratorQuestion, QuestionAnswer } from "@/lib/revision/types";
import type { CaseRow, Team } from "@/lib/types";

type RobustnessRow = {
  person_id: string;
  person_name: string;
  improved_count: number;
  bank_size: number;
  share: number;
};

export default function ModeratorBankPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [caseId, setCaseId] = useState("");
  const [paste, setPaste] = useState("");
  const [pending, setPending] = useState<ModeratorQuestion[]>([]);
  const [active, setActive] = useState<ModeratorQuestion[]>([]);
  const [bestByQuestion, setBestByQuestion] = useState<
    Record<string, QuestionAnswer | null>
  >({});
  const [answersByQuestion, setAnswersByQuestion] = useState<
    Record<string, QuestionAnswer[]>
  >({});
  const [robustness, setRobustness] = useState<RobustnessRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drillQ, setDrillQ] = useState<ModeratorQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [sessionKey] = useState(() => `drill-${Date.now()}`);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const metaRes = await fetch("/api/revision/one-pagers");
      const meta = (await metaRes.json()) as {
        teams?: Team[];
        cases?: CaseRow[];
        error?: string;
      };
      if (!metaRes.ok) {
        setError(meta.error ?? "Could not load cases. Try again.");
        return;
      }
      setTeams(meta.teams ?? []);
      if (!teamId && meta.teams?.[0]) setTeamId(meta.teams[0].id);
      setCases(meta.cases ?? []);
      if (!caseId && meta.cases?.[0]) setCaseId(meta.cases[0].id);
      const cid = caseId || meta.cases?.[0]?.id;
      const tid = teamId || meta.teams?.[0]?.id;
      if (!cid) return;

      const detailQs = tid ? `&teamId=${tid}` : "";
      const [pRes, aRes] = await Promise.all([
        fetch(`/api/revision/questions?caseId=${cid}&status=pending_confirm`),
        fetch(
          `/api/revision/questions?caseId=${cid}&status=active${detailQs}`,
        ),
      ]);
      const p = (await pRes.json()) as {
        questions?: ModeratorQuestion[];
        error?: string;
      };
      const a = (await aRes.json()) as {
        questions?: ModeratorQuestion[];
        bestByQuestion?: Record<string, QuestionAnswer | null>;
        answersByQuestion?: Record<string, QuestionAnswer[]>;
        robustness?: RobustnessRow[];
        error?: string;
      };
      if (!pRes.ok || !aRes.ok) {
        setError(
          p.error ?? a.error ?? "Could not load the question bank. Try again.",
        );
        return;
      }
      setPending(p.questions ?? []);
      setActive(a.questions ?? []);
      setBestByQuestion(a.bestByQuestion ?? {});
      setAnswersByQuestion(a.answersByQuestion ?? {});
      setRobustness(a.robustness ?? []);
    } catch {
      setError("Could not load the question bank. Try again.");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, teamId]);

  async function splitPaste() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/revision/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "paste", raw: paste, caseId }),
      });
      const data = (await res.json()) as {
        questions?: ModeratorQuestion[];
        error?: string;
      };
      if (!res.ok) {
        setError(
          data.error ?? "Cruxy could not split that text. Try again.",
        );
        return;
      }
      setPending(data.questions ?? []);
      setPaste("");
      await load();
    } catch {
      setError("Cruxy could not split that text. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function generateCruxy() {
    if (!teamId || !caseId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/revision/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "generate_cruxy",
          teamId,
          caseId,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(
          data.error ?? "Cruxy could not generate questions. Try again.",
        );
        return;
      }
      await load();
    } catch {
      setError("Cruxy could not generate questions. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmOne(id: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/revision/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "confirm", questionIds: [id] }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Could not confirm. Try again.");
        return;
      }
      await load();
    } catch {
      setError("Could not confirm. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function rejectOne(id: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/revision/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          questionIds: [],
          rejectIds: [id],
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Could not reject. Try again.");
        return;
      }
      await load();
    } catch {
      setError("Could not reject. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmAll() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/revision/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          questionIds: pending.map((q) => q.id),
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Could not confirm. Try again.");
        return;
      }
      await load();
    } catch {
      setError("Could not confirm. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function serve() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/revision/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "serve",
          sessionKey,
          preferredCaseIds: caseId ? [caseId] : undefined,
        }),
      });
      const data = (await res.json()) as {
        question?: ModeratorQuestion | null;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not serve a question. Try again.");
        return;
      }
      setDrillQ(data.question ?? null);
      setAnswer("");
      setFeedback(
        data.question
          ? ""
          : "No more questions for this session. Refresh the bank or pick another case.",
      );
    } catch {
      setError("Could not serve a question. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer() {
    if (!drillQ || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/revision/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "answer",
          questionId: drillQ.id,
          text: answer,
          mode: "typed",
          teamId,
        }),
      });
      const data = (await res.json()) as {
        answer?: { feedback: string | null; score: number | null };
        error?: string;
      };
      if (!res.ok || !data.answer) {
        setError(data.error ?? "Could not log your answer. Try again.");
        return;
      }
      const score =
        data.answer.score != null
          ? data.answer.score.toFixed(2)
          : "Not scored yet";
      setFeedback(`${data.answer.feedback ?? ""} (score ${score})`);
      await load();
    } catch {
      setError("Could not log your answer. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString();
  }

  return (
    <main className="animate-fade-up space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Moderator bank</h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Questions a moderator or judge might ask on this case. Paste a list,
          confirm what Cruxy splits out, then practise answering out loud.
        </p>
      </div>

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
            onClick={() => void load()}
          >
            Try again
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
          Team
          <select
            className="w-full max-w-full rounded-xl border border-ink/15 bg-white/80 px-3 py-2 text-sm text-ink sm:w-auto sm:max-w-md"
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
            className="w-full max-w-full rounded-xl border border-ink/15 bg-white/80 px-3 py-2 text-sm text-ink sm:w-auto sm:max-w-md"
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
          variant="secondary"
          className="self-end"
          disabled={busy || !teamId}
          aria-busy={busy}
          onClick={() => void generateCruxy()}
        >
          Generate with Cruxy
        </Button>
      </div>

      {teamId && robustness.length ? (
        <section className="rounded-2xl border border-ink/10 bg-white/70 p-4">
          <h2 className="font-display text-lg font-semibold">Robustness meter</h2>
          <p className="mt-1 text-xs text-muted">
            Share of bank questions each member now answers better than their own first
            try.
          </p>
          <ul className="mt-3 space-y-2">
            {robustness.map((r) => (
              <li key={r.person_id} className="text-sm">
                <span className="font-medium">{r.person_name}</span>
                <span className="text-muted">
                  {" "}
                  {Math.round(r.share * 100)}% ({r.improved_count} of {r.bank_size})
                </span>
                <div className="mt-1 h-2 w-full max-w-md overflow-hidden rounded-full bg-ink/10">
                  <div
                    className="h-full bg-cardinal/80"
                    style={{ width: `${Math.round(r.share * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-ink/10 bg-white/70 p-4">
        <h2 className="font-display text-lg font-semibold">
          Paste in (Dr. B or any member)
        </h2>
        <label className="block text-xs font-semibold text-muted">
          Unstructured text
          <textarea
            className="mt-1 min-h-28 w-full rounded-xl border border-ink/15 bg-paper/50 p-3 text-sm text-ink"
            placeholder="Paste an email, list, or voice-note transcript"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            disabled={busy}
          />
        </label>
        <Button
          type="button"
          disabled={busy || !paste.trim()}
          aria-busy={busy}
          onClick={() => void splitPaste()}
        >
          Split into questions
        </Button>
      </section>

      {pending.length ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">
              Confirm ({pending.length})
            </h2>
            <Button type="button" size="sm" onClick={() => void confirmAll()}>
              Confirm all
            </Button>
          </div>
          <ul className="space-y-2">
            {pending.map((q) => (
              <li
                key={q.id}
                className="rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm"
              >
                <p>{q.text}</p>
                <p className="mt-1 text-xs text-muted">
                  {q.origin_label}, {q.type}, difficulty {q.difficulty}, pending
                </p>
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void confirmOne(q.id)}
                  >
                    Accept
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void rejectOne(q.id)}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">
          Active bank ({active.length})
        </h2>
        {!active.length ? (
          <p className="text-sm text-muted">
            No active questions for this case yet. Paste a list or generate with
            Cruxy, then confirm.
          </p>
        ) : null}
        <ul className="space-y-2">
          {active.map((q) => {
            const best = bestByQuestion[q.id];
            const log = answersByQuestion[q.id] ?? [];
            const open = expandedId === q.id;
            return (
              <li
                key={q.id}
                className="rounded-xl border border-ink/10 bg-white/60 px-3 py-2 text-sm"
              >
                <p>{q.text}</p>
                <p className="mt-1 text-xs text-muted">
                  {q.origin_label}, {q.type}, d{q.difficulty}
                  {q.asked_at_tag ? `, ${q.asked_at_tag}` : ""}
                </p>
                {best ? (
                  <p className="mt-2 text-xs text-muted">
                    Best team answer (score {best.score?.toFixed(2) ?? "n/a"},{" "}
                    {formatTime(best.created_at)}): {best.text.slice(0, 120)}
                    {best.text.length > 120 ? "…" : ""}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted">No team answers yet.</p>
                )}
                {log.length ? (
                  <button
                    type="button"
                    className="mt-1 text-xs text-cardinal underline"
                    onClick={() => setExpandedId(open ? null : q.id)}
                  >
                    {open ? "Hide" : "Show"} answer log ({log.length})
                  </button>
                ) : null}
                {open ? (
                  <ul className="mt-2 space-y-1 border-t border-ink/10 pt-2 text-xs text-muted">
                    {log.map((a) => (
                      <li key={a.id}>
                        Score {a.score?.toFixed(2) ?? "n/a"}, {formatTime(a.created_at)}
                        {a.feedback ? `, ${a.feedback}` : ""}: {a.text.slice(0, 80)}
                        {a.text.length > 80 ? "…" : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3 rounded-2xl border border-ink/10 bg-white/70 p-4">
        <h2 className="font-display text-lg font-semibold">Drill serve</h2>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void serve()}
        >
          Next question
        </Button>
        {drillQ ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{drillQ.text}</p>
            <label className="block text-xs font-semibold text-muted">
              Your answer
              <textarea
                className="mt-1 min-h-24 w-full rounded-xl border border-ink/15 p-3 text-sm text-ink"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type your answer"
                disabled={busy}
              />
            </label>
            <Button
              type="button"
              size="sm"
              disabled={busy || !answer.trim()}
              aria-busy={busy}
              onClick={() => void submitAnswer()}
            >
              Log answer
            </Button>
            {feedback ? <p className="text-xs text-muted">{feedback}</p> : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}