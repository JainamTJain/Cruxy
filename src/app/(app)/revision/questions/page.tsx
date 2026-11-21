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

  async function load() {
    const meta = await fetch("/api/revision/one-pagers").then((r) => r.json());
    setTeams(meta.teams ?? []);
    if (!teamId && meta.teams?.[0]) setTeamId(meta.teams[0].id);
    setCases(meta.cases ?? []);
    if (!caseId && meta.cases?.[0]) setCaseId(meta.cases[0].id);
    const cid = caseId || meta.cases?.[0]?.id;
    const tid = teamId || meta.teams?.[0]?.id;
    if (!cid) return;

    const detailQs = tid ? `&teamId=${tid}` : "";
    const [p, a] = await Promise.all([
      fetch(`/api/revision/questions?caseId=${cid}&status=pending_confirm`).then(
        (r) => r.json(),
      ),
      fetch(
        `/api/revision/questions?caseId=${cid}&status=active${detailQs}`,
      ).then((r) => r.json()),
    ]);
    setPending(p.questions ?? []);
    setActive(a.questions ?? []);
    setBestByQuestion(a.bestByQuestion ?? {});
    setAnswersByQuestion(a.answersByQuestion ?? {});
    setRobustness(a.robustness ?? []);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, teamId]);

  async function splitPaste() {
    setBusy(true);
    try {
      const res = await fetch("/api/revision/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "paste", raw: paste, caseId }),
      });
      const data = (await res.json()) as { questions: ModeratorQuestion[] };
      setPending(data.questions);
      setPaste("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function generateCruxy() {
    if (!teamId || !caseId) return;
    setBusy(true);
    try {
      await fetch("/api/revision/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "generate_cruxy",
          teamId,
          caseId,
        }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function confirmOne(id: string) {
    await fetch("/api/revision/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "confirm", questionIds: [id] }),
    });
    await load();
  }

  async function rejectOne(id: string) {
    await fetch("/api/revision/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "confirm", questionIds: [], rejectIds: [id] }),
    });
    await load();
  }

  async function confirmAll() {
    await fetch("/api/revision/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "confirm",
        questionIds: pending.map((q) => q.id),
      }),
    });
    await load();
  }

  async function serve() {
    const res = await fetch("/api/revision/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "serve",
        sessionKey,
        preferredCaseIds: caseId ? [caseId] : undefined,
      }),
    });
    const data = (await res.json()) as { question: ModeratorQuestion | null };
    setDrillQ(data.question);
    setAnswer("");
    setFeedback("");
  }

  async function submitAnswer() {
    if (!drillQ) return;
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
      answer: { feedback: string | null; score: number | null };
    };
    const score =
      data.answer.score != null ? data.answer.score.toFixed(2) : "Not set";
    setFeedback(`${data.answer.feedback ?? ""} (score ${score})`);
    await load();
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString();
  }

  return (
    <main className="animate-fade-up space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Moderator bank</h1>
        <p className="mt-1 text-sm text-muted">
          Shared per case. Paste unstructured text. Cruxy splits and tags for confirm.
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
        <Button
          type="button"
          variant="secondary"
          disabled={busy || !teamId}
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
        <h2 className="font-display text-lg font-semibold">Paste in (Dr. B)</h2>
        <textarea
          className="min-h-28 w-full rounded-xl border border-ink/15 bg-paper/50 p-3 text-sm"
          placeholder="Paste an email, list, or voice-note transcript"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <Button type="button" disabled={busy} onClick={() => void splitPaste()}>
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
        <Button type="button" variant="secondary" onClick={() => void serve()}>
          Next question
        </Button>
        {drillQ ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{drillQ.text}</p>
            <textarea
              className="min-h-24 w-full rounded-xl border border-ink/15 p-3 text-sm"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer"
            />
            <Button type="button" size="sm" onClick={() => void submitAnswer()}>
              Log answer
            </Button>
            {feedback ? <p className="text-xs text-muted">{feedback}</p> : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}