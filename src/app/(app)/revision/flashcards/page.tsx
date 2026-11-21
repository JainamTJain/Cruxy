"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Flashcard } from "@/lib/revision/types";

type DueItem = { card: Flashcard; state: unknown };

export default function FlashcardsPage() {
  const [items, setItems] = useState<DueItem[]>([]);
  const [studying, setStudying] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [status, setStatus] = useState("");

  async function refresh() {
    const res = await fetch("/api/revision/flashcards?due=1");
    const data = (await res.json()) as {
      cards: DueItem[];
      studying: string[];
    };
    setItems(data.cards);
    setStudying(data.studying);
    setIdx(0);
    setFlipped(false);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function grade(g: 1 | 2 | 3 | 4) {
    const current = items[idx];
    if (!current) return;
    await fetch("/api/revision/flashcards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "review",
        cardId: current.card.id,
        grade: g,
        mode: "typed",
      }),
    });
    setStatus(`Rated ${g}`);
    const next = items.filter((_, i) => i !== idx);
    setItems(next);
    setIdx(0);
    setFlipped(false);
  }

  const card = items[idx]?.card;

  return (
    <main className="animate-fade-up space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Flashcards</h1>
        <p className="mt-1 text-sm text-muted">
          FSRS spacing · cards refresh when Truth Sources change · typed or spoken.
        </p>
        {studying.length ? (
          <p className="mt-2 text-xs text-cardinal">{studying.join(" · ")}</p>
        ) : null}
      </div>

      {card ? (
        <div className="mx-auto max-w-lg space-y-4">
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className="min-h-48 w-full rounded-2xl border border-ink/10 bg-white/80 p-6 text-left shadow-sm"
          >
            <p className="text-xs uppercase tracking-wide text-muted">
              {flipped ? "Back" : "Front"} ·{" "}
              {card.citation_ids.length
                ? `${card.citation_ids.length} citation(s)`
                : "needs citation"}
            </p>
            <p className="mt-3 text-lg">{flipped ? card.back : card.front}</p>
          </button>
          <div className="grid grid-cols-4 gap-2">
            {(
              [
                [1, "Again"],
                [2, "Hard"],
                [3, "Good"],
                [4, "Easy"],
              ] as const
            ).map(([g, label]) => (
              <Button
                key={g}
                type="button"
                size="sm"
                variant={g === 1 ? "outline" : g === 4 ? "gold" : "secondary"}
                onClick={() => void grade(g)}
              >
                {label}
              </Button>
            ))}
          </div>
          <p className="text-center text-xs text-muted">
            {items.length} due · tap card to flip
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-ink/10 bg-white/70 p-6 text-sm text-muted">
          No cards due. Leads get decks when Truth Sources exist; others can opt in from
          a case.
          <div className="mt-3">
            <Button type="button" size="sm" onClick={() => void refresh()}>
              Refresh
            </Button>
          </div>
        </div>
      )}
      {status ? <p className="text-xs text-muted">{status}</p> : null}
    </main>
  );
}
