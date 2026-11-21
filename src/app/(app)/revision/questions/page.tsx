"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ModeratorQuestion } from "@/lib/revision/types";
import type { CaseRow } from "@/lib/types";

export default function ModeratorBankPage() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [caseId, setCaseId] = useState("");
  const [paste, setPaste] = useState("");
  const [pending, setPending] = useState<ModeratorQuestion[]>([]);
  const [active, setActive] = useState<ModeratorQuestion[]>([]);
  const [drillQ, setDrillQ] = useState<ModeratorQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [sessionKey] = useState(() => `drill-${Date.now()}`);
  const [feedback, setFeedback] = useState("");

  async function load() {
    const meta = await fetch("/api/revision/one-pagers").then((r) => r.json());
    setCases(meta.cases ?? []);
    if (!caseId && meta.cases?.[0]) setCaseId(meta.cases[0].id);
    const cid = caseId || meta.cases?.[0]?.id;
    if (!cid) return;
    const [p, a] = await Promise.all([
      fetch(`/api/revision/questions?caseId=${cid}&status=pending_confirm`).then(
        (r) => r.json(),
      ),
      fetch(`/api/revision/questions?caseId=${cid}&status=active`).then((r) =>
        r.json(),
      ),
    ]);
    setPending(p.questions ?? []);
    setActive(a.questions ?? []);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  async function splitPaste() {
    const res = await fetch("/api/revision/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "paste", raw: paste, caseId }),
    });
    const data = (await res.json()) as { questions: ModeratorQuestion[] };
    setPending(data.questions);
    setPaste("");
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
      }),
    });
    const data = (await res.json()) as {
      answer: { feedback: string | null; score: number | null };
    };
    setFeedback(
      `${data.answer.feedback ?? ""} (score ${data.answer.score?.toFixed(2) ?? "Not set"})`,
    );
  }

  return (
    <main className="animate-fade-up space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Moderator bank</h1>
        <p className="mt-1 text-sm text-muted">
          Shared per case. Paste unstructured text — Cruxy splits and tags for confirm.
        </p>
      </div>

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

      <section className="space-y-3 rounded-2xl border border-ink/10 bg-white/70 p-4">
        <h2 className="font-display text-lg font-semibold">Paste in (Dr. B)</h2>
        <textarea
          className="min-h-28 w-full rounded-xl border border-ink/15 bg-paper/50 p-3 text-sm"
          placeholder="Paste an email, list, or voice-note transcript…"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <Button type="button" onClick={() => void splitPaste()}>
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
          {active.map((q) => (
            <li
              key={q.id}
              className="rounded-xl border border-ink/10 bg-white/60 px-3 py-2 text-sm"
            >
              <p>{q.text}</p>
              <p className="mt-1 text-xs text-muted">
                {q.origin_label}, {q.type}, d{q.difficulty}
                {q.asked_at_tag ? `, ${q.asked_at_tag}` : ""}
              </p>
            </li>
          ))}
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
              placeholder="Type your answer (or speak later in Practice track)…"
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
