"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Flashcard, ModeratorQuestion } from "@/lib/revision/types";

type Warm = {
  flashcards: Flashcard[];
  moderator_questions: ModeratorQuestion[];
  counterclaim_prompt: string;
  minutes: number;
};

export default function WarmUpPage() {
  const [warm, setWarm] = useState<Warm | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/revision/warmup");
      setWarm((await res.json()) as Warm);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="animate-fade-up space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">
          10-minute warm-up
        </h1>
        <p className="mt-1 text-sm text-muted">
          Morning of a round: 5 flashcards, 2 moderator questions out loud, 1
          counterclaim rebuttal.
        </p>
      </div>

      <Button type="button" onClick={() => void load()} disabled={loading}>
        {loading ? "Building…" : "Build warm-up"}
      </Button>

      {warm ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-ink/10 bg-white/70 p-4">
            <h2 className="font-display text-lg font-semibold">
              Flashcards ({warm.flashcards.length}/5)
            </h2>
            <ul className="mt-2 space-y-2 text-sm">
              {warm.flashcards.map((c) => (
                <li key={c.id} className="rounded-xl bg-mist/50 px-3 py-2">
                  {c.front}
                </li>
              ))}
              {!warm.flashcards.length ? (
                <li className="text-muted">
                  Sync Truth Sources / opt into a deck first.
                </li>
              ) : null}
            </ul>
          </section>

          <section className="rounded-2xl border border-ink/10 bg-white/70 p-4">
            <h2 className="font-display text-lg font-semibold">
              Moderator questions (answer out loud)
            </h2>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm">
              {warm.moderator_questions.map((q) => (
                <li key={q.id}>{q.text}</li>
              ))}
            </ol>
          </section>

          <section className="rounded-2xl border border-cardinal/20 bg-cardinal/5 p-4">
            <h2 className="font-display text-lg font-semibold">Counterclaim</h2>
            <p className="mt-2 text-sm">{warm.counterclaim_prompt}</p>
          </section>
        </div>
      ) : null}
    </main>
  );
}
