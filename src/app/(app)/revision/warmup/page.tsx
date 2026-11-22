"use client";

import { useState } from "react";
import { useCruxy } from "@/components/cruxy/cruxy-context";
import type { Flashcard, ModeratorQuestion } from "@/lib/revision/types";

type Warm = {
  flashcards: Flashcard[];
  moderator_questions: ModeratorQuestion[];
  counterclaim_prompt: string;
  minutes: number;
};

export default function WarmUpPage() {
  const { setMood } = useCruxy();
  const [warm, setWarm] = useState<Warm | null>(null);
  const [loading, setLoading] = useState(false);
  const [doneCards, setDoneCards] = useState(0);
  const [doneQs, setDoneQs] = useState(0);
  const [doneRebut, setDoneRebut] = useState(false);

  async function load() {
    setLoading(true);
    setDoneCards(0);
    setDoneQs(0);
    setDoneRebut(false);
    try {
      const res = await fetch("/api/revision/warmup");
      setWarm((await res.json()) as Warm);
      setMood("curious");
    } finally {
      setLoading(false);
    }
  }

  function markCard() {
    setDoneCards((n) => {
      const next = Math.min(5, n + 1);
      if (next >= 5 && doneQs >= 2 && doneRebut) setMood("excited");
      else if (next >= 1) setMood("happy");
      return next;
    });
  }

  function markQ() {
    setDoneQs((n) => {
      const next = Math.min(2, n + 1);
      if (doneCards >= 5 && next >= 2 && doneRebut) setMood("excited");
      return next;
    });
  }

  function markRebut() {
    setDoneRebut(true);
    if (doneCards >= 5 && doneQs >= 2) setMood("excited");
  }

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
          out loud, and one counterclaim rebuttal. Built from cases on your
          roadmap.
        </p>
      </div>

      <button
        type="button"
        onClick={() => void load()}
        disabled={loading}
        className="h-12 rounded-xl bg-ink text-sm font-semibold text-white disabled:opacity-60"
      >
        {loading
          ? "Building your warm-up…"
          : warm
            ? "Build a new warm-up"
            : "Build my warm-up"}
      </button>

      {warm ? (
        <div className="space-y-5">
          <section className="rounded-[20px] bg-white p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-extrabold">
                Flashcards ({doneCards}/{warm.flashcards.length || 5})
              </h2>
              <span className="text-xs text-muted">~4 min</span>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {warm.flashcards.map((c) => (
                <li
                  key={c.id}
                  className="flex items-start justify-between gap-2 rounded-xl bg-paper px-3 py-2"
                >
                  <span>{c.front}</span>
                  <button
                    type="button"
                    onClick={markCard}
                    className="shrink-0 text-xs font-bold text-cardinal"
                  >
                    Done
                  </button>
                </li>
              ))}
              {!warm.flashcards.length ? (
                <li className="text-muted">
                  Sync Truth Sources or opt into a deck first.
                </li>
              ) : null}
            </ul>
          </section>

          <section className="rounded-[20px] bg-white p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-extrabold">
                Moderator questions ({doneQs}/2)
              </h2>
              <span className="text-xs text-muted">out loud, ~4 min</span>
            </div>
            <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm">
              {warm.moderator_questions.map((q) => (
                <li key={q.id} className="leading-snug">
                  <div className="flex items-start justify-between gap-2">
                    <span>{q.text}</span>
                    <button
                      type="button"
                      onClick={markQ}
                      className="shrink-0 text-xs font-bold text-cardinal"
                    >
                      Said it
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-[20px] border border-cardinal/20 bg-cardinal/5 p-5">
            <h2 className="font-display text-lg font-extrabold">
              Counterclaim rebuttal
            </h2>
            <p className="mt-2 text-sm leading-snug">{warm.counterclaim_prompt}</p>
            <button
              type="button"
              onClick={markRebut}
              className="mt-4 h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-white"
            >
              {doneRebut ? "Rebutted" : "I answered out loud"}
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
