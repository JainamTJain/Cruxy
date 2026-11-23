"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCruxy } from "@/components/cruxy/cruxy-context";
import type { Flashcard, ModeratorQuestion } from "@/lib/revision/types";

type Warm = {
  flashcards: Flashcard[];
  moderator_questions: ModeratorQuestion[];
  counterclaim_prompt: string;
  minutes: number;
  caseId?: string | null;
};

function WarmUpInner() {
  const search = useSearchParams();
  const caseId = search.get("caseId");
  const { setMood } = useCruxy();
  const [warm, setWarm] = useState<Warm | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneCardIds, setDoneCardIds] = useState<Set<string>>(new Set());
  const [doneQIds, setDoneQIds] = useState<Set<string>>(new Set());
  const [doneRebut, setDoneRebut] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    setDoneCardIds(new Set());
    setDoneQIds(new Set());
    setDoneRebut(false);
    try {
      const qs = caseId ? `?caseId=${encodeURIComponent(caseId)}` : "";
      const res = await fetch(`/api/revision/warmup${qs}`);
      const data = (await res.json()) as Warm & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Could not build your warm-up. Try again.");
        setWarm(null);
        return;
      }
      setWarm(data);
      setMood("curious");
    } catch {
      setError("Could not build your warm-up. Try again.");
      setWarm(null);
    } finally {
      setLoading(false);
    }
  }

  async function markCard(cardId: string) {
    if (doneCardIds.has(cardId) || busyId) return;
    setBusyId(cardId);
    setError(null);
    try {
      const res = await fetch("/api/revision/warmup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "review_card", cardId }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Could not save that card. Try again.");
        return;
      }
      const nextCards = new Set(doneCardIds);
      nextCards.add(cardId);
      setDoneCardIds(nextCards);
      setMood("happy");
      void maybeComplete({
        cards: nextCards.size,
        questions: doneQIds.size,
        rebut: doneRebut,
      });
    } catch {
      setError("Could not save that card. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function markQ(questionId: string) {
    if (doneQIds.has(questionId) || busyId) return;
    setBusyId(questionId);
    setError(null);
    try {
      const res = await fetch("/api/revision/warmup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "answer_question",
          questionId,
          text: "Answered out loud in warm-up.",
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Could not log that answer. Try again.");
        return;
      }
      const nextQs = new Set(doneQIds);
      nextQs.add(questionId);
      setDoneQIds(nextQs);
      void maybeComplete({
        cards: doneCardIds.size,
        questions: nextQs.size,
        rebut: doneRebut,
      });
    } catch {
      setError("Could not log that answer. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function markRebut() {
    if (doneRebut || busyId) return;
    setDoneRebut(true);
    setMood("excited");
    void maybeComplete({
      cards: doneCardIds.size,
      questions: doneQIds.size,
      rebut: true,
    });
  }

  async function maybeComplete(progress: {
    cards: number;
    questions: number;
    rebut: boolean;
  }) {
    if (!warm) return;
    const cardNeed = Math.min(5, warm.flashcards.length || 0);
    const qNeed = Math.min(2, warm.moderator_questions.length || 0);
    const cardsDone = cardNeed === 0 || progress.cards >= cardNeed;
    const qsDone = qNeed === 0 || progress.questions >= qNeed;
    if (!(cardsDone && qsDone && progress.rebut)) return;
    setMood("excited");
    try {
      await fetch("/api/revision/warmup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          caseId: warm.caseId ?? caseId,
        }),
      });
    } catch {
      // Soft: completion log is best-effort.
    }
  }

  const cardTarget = warm?.flashcards.length || 5;
  const qTarget = Math.min(2, warm?.moderator_questions.length || 2);

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 animate-fade-up">
      <div>
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
          Morning of a round
        </span>
        <h1 className="font-display mt-1 text-[40px] font-extrabold leading-none">
          10-minute warm-up
        </h1>
        <p className="mt-2 text-sm text-muted">
          A quick run before a round: five flashcards, two moderator questions
          out loud, and one counterclaim rebuttal
          {caseId ? " for this case" : " from cases on your roadmap"}.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void load()}
        disabled={loading}
        aria-busy={loading}
        className="h-12 rounded-xl bg-ink text-sm font-semibold text-white disabled:opacity-60"
      >
        {loading
          ? "Building your warm-up…"
          : warm
            ? "Build a new warm-up"
            : "Build my warm-up"}
      </button>

      {error ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-cardinal" role="alert">
            {error}
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="h-10 rounded-xl border border-ink/15 bg-white px-3 text-sm font-semibold"
          >
            Try again
          </button>
        </div>
      ) : null}

      {warm ? (
        <div className="space-y-5">
          <section className="rounded-[20px] bg-white p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-extrabold">
                Flashcards ({doneCardIds.size}/{cardTarget})
              </h2>
              <span className="text-xs text-muted">~4 min</span>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {warm.flashcards.map((c) => {
                const done = doneCardIds.has(c.id);
                return (
                  <li
                    key={c.id}
                    className="flex items-start justify-between gap-2 rounded-xl bg-paper px-3 py-2"
                  >
                    <span>{c.front}</span>
                    <button
                      type="button"
                      disabled={done || busyId === c.id}
                      aria-busy={busyId === c.id}
                      onClick={() => void markCard(c.id)}
                      className="min-h-11 shrink-0 text-xs font-bold text-cardinal disabled:opacity-50"
                    >
                      {done ? "Done" : "Done"}
                    </button>
                  </li>
                );
              })}
              {!warm.flashcards.length ? (
                <li className="text-muted">
                  Sync Evidence Library or opt into a deck first.
                </li>
              ) : null}
            </ul>
          </section>

          <section className="rounded-[20px] bg-white p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-extrabold">
                Moderator questions ({doneQIds.size}/{qTarget || 2})
              </h2>
              <span className="text-xs text-muted">out loud, ~4 min</span>
            </div>
            {warm.moderator_questions.length ? (
              <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm">
                {warm.moderator_questions.map((q) => {
                  const done = doneQIds.has(q.id);
                  return (
                    <li key={q.id} className="leading-snug">
                      <div className="flex items-start justify-between gap-2">
                        <span>{q.text}</span>
                        <button
                          type="button"
                          disabled={done || busyId === q.id}
                          aria-busy={busyId === q.id}
                          onClick={() => void markQ(q.id)}
                          className="min-h-11 shrink-0 text-xs font-bold text-cardinal disabled:opacity-50"
                        >
                          {done ? "Said it" : "Said it"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-muted">
                No moderator questions in the bank for this case yet. Ask Dr. B
                to paste a few, or generate with Cruxy on the bank page.
              </p>
            )}
          </section>

          <section className="rounded-[20px] border border-cardinal/20 bg-cardinal/5 p-5">
            <h2 className="font-display text-lg font-extrabold">
              Counterclaim rebuttal
            </h2>
            <p className="mt-2 text-sm leading-snug">{warm.counterclaim_prompt}</p>
            <button
              type="button"
              onClick={() => void markRebut()}
              disabled={doneRebut}
              className="mt-4 h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {doneRebut ? "Rebutted" : "I answered out loud"}
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default function WarmUpPage() {
  return (
    <Suspense
      fallback={
        <p className="p-4 text-sm text-muted" role="status">
          Loading warm-up…
        </p>
      }
    >
      <WarmUpInner />
    </Suspense>
  );
}
