"use client";

import { useEffect, useMemo, useState } from "react";
import { useCruxy } from "@/components/cruxy/cruxy-context";
import {
  previewIntervals,
  type FsrsRating,
} from "@/lib/revision/fsrs";
import type { Flashcard } from "@/lib/revision/types";

type DueItem = {
  card: Flashcard;
  state: {
    due?: string;
    stability?: number;
    difficulty?: number;
    scheduled_days?: number;
    reps?: number;
    lapses?: number;
    state?: number;
    last_review?: string | null;
  } | null;
};

export default function FlashcardsPage() {
  const { setMood } = useCruxy();
  const [items, setItems] = useState<DueItem[]>([]);
  const [studying, setStudying] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [spoken, setSpoken] = useState(false);
  const [initialCount, setInitialCount] = useState(0);
  const [deckLabel, setDeckLabel] = useState("your deck");

  async function refresh() {
    const res = await fetch("/api/revision/flashcards?due=1");
    const data = (await res.json()) as {
      cards: DueItem[];
      studying: string[];
    };
    setItems(data.cards);
    setStudying(data.studying);
    setInitialCount(data.cards.length);
    setIdx(0);
    setFlipped(false);
    setSpoken(false);
    const first = data.cards[0]?.card;
    if (first) {
      setDeckLabel(first.deck || "your lead deck");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const card = items[idx]?.card;
  const intervals = useMemo(() => {
    const state = items[idx]?.state;
    if (!state) return previewIntervals(null);
    return previewIntervals({
      due: state.due ? new Date(state.due) : new Date(),
      stability: state.stability ?? 0,
      difficulty: state.difficulty ?? 0,
      elapsed_days: 0,
      scheduled_days: state.scheduled_days ?? 0,
      reps: state.reps ?? 0,
      lapses: state.lapses ?? 0,
      state: (state.state ?? 0) as 0 | 1 | 2 | 3,
      last_review: state.last_review ? new Date(state.last_review) : null,
    });
  }, [items, idx]);

  const progressPct =
    initialCount === 0
      ? 0
      : Math.round(((initialCount - items.length) / initialCount) * 100);

  async function grade(g: FsrsRating) {
    const current = items[idx];
    if (!current) return;
    await fetch("/api/revision/flashcards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "review",
        cardId: current.card.id,
        grade: g,
        mode: spoken ? "spoken" : "typed",
      }),
    });
    if (g >= 3) setMood("happy");
    const next = items.filter((_, i) => i !== idx);
    if (next.length === 0) setMood("excited");
    setItems(next);
    setIdx(0);
    setFlipped(false);
    setSpoken(false);
  }

  // Phone-first FlashPhone layout; also works at desktop width.
  return (
    <main className="mx-auto flex min-h-[min(844px,100dvh)] w-full max-w-[390px] flex-col gap-3.5 p-4 sm:max-w-lg">
      <div className="flex items-center justify-between">
        <span className="font-display text-[26px] font-extrabold tracking-[-0.03em]">
          crux
        </span>
        <span className="text-xs font-bold text-muted">
          {items.length} due
          {studying.length ? ` · ${studying[0]}` : ""}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold">
          <span className="text-cardinal">
            {card?.deck?.match(/Case\s*\d+/i)?.[0] ??
              (card ? "Deck" : "Flashcards")}
          </span>{" "}
          · {deckLabel}
          {initialCount ? ` · ${initialCount} cards` : ""}
        </span>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#E3E5E9]">
          <div
            className="h-1.5 rounded-full bg-ink transition-[width]"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {card ? (
        <section className="flex flex-1 flex-col gap-3">
          <div className="flex flex-col gap-2.5 rounded-[20px] bg-ink p-[22px] text-white">
            <span className="text-[11px] font-bold tracking-[0.1em] text-gold">
              {card.source_kind === "truth"
                ? "TRUTH SOURCE"
                : card.source_kind === "reading"
                  ? "FROM READING"
                  : "CARD"}
            </span>
            <p className="font-display m-0 text-2xl font-semibold leading-tight">
              {card.front}
            </p>
          </div>

          {flipped ? (
            <div className="flex flex-col gap-2.5 rounded-[20px] border-2 border-ink bg-white p-[22px]">
              <span className="text-[11px] font-bold tracking-[0.1em] text-muted">
                ANSWER
              </span>
              <p className="m-0 whitespace-pre-wrap text-base leading-relaxed">
                {card.back}
              </p>
              {card.citation_ids.length ? (
                <span className="self-start rounded-md bg-paper px-1.5 py-0.5 font-mono text-[11px] font-medium">
                  Truth Source · {card.citation_ids.length} cite
                  {card.citation_ids.length === 1 ? "" : "s"}
                </span>
              ) : (
                <span className="self-start rounded-md bg-cardinal/10 px-1.5 py-0.5 font-mono text-[11px] text-cardinal">
                  Needs citation
                </span>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setFlipped(true)}
              className="rounded-[20px] border-2 border-dashed border-[#C9CCD3] bg-white p-[22px] text-left text-sm text-muted"
            >
              Tap to show the answer
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setSpoken(true);
              setFlipped(true);
            }}
            className="h-12 rounded-xl border border-[#C9CCD3] bg-white text-sm font-semibold"
          >
            Say it out loud instead
          </button>
        </section>
      ) : (
        <section className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[20px] bg-white p-6 text-center text-sm text-muted">
          <p>No cards due. Leads get decks from Truth Sources; others can opt in.</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-white"
          >
            Refresh
          </button>
        </section>
      )}

      {card && flipped ? (
        <div className="flex flex-col gap-2">
          <span className="text-center text-xs font-semibold text-muted">
            How well did you know it?
          </span>
          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                [1, "Again", "bg-[#FDECEC] text-cardinal"],
                [2, "Hard", "bg-white text-ink"],
                [3, "Good", "bg-ink text-white"],
                [4, "Easy", "bg-[#E8F5F1] text-[#0B5E53]"],
              ] as const
            ).map(([g, label, cls]) => (
              <button
                key={g}
                type="button"
                onClick={() => void grade(g)}
                className={`flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-sm font-bold ${cls}`}
              >
                {label}
                <span className="text-[11px] font-medium opacity-80">
                  {intervals[g]}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </main>
  );
}
