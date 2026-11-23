"use client";

import { useCallback, useEffect, useState } from "react";
import { useSwipeable } from "react-swipeable";
import { useCruxy } from "@/components/cruxy/cruxy-context";
import { emitMood } from "@/components/cruxy/mood/bus";
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
    correct_streak?: number;
    pinned?: boolean;
  } | null;
  underAttack?: boolean;
  mastery?: number | null;
};

type DeckMeta = {
  dailyTarget: number;
  cramMode: boolean;
  daysToCompetition: number | null;
  totalInRotation: number;
  openAttackCount: number;
};

export default function FlashcardsPage() {
  const { setMood, setBubble, emitCruxyEvent } = useCruxy();
  const [items, setItems] = useState<DueItem[]>([]);
  const [studying, setStudying] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [spoken, setSpoken] = useState(false);
  const [initialCount, setInitialCount] = useState(0);
  const [deckLabel, setDeckLabel] = useState("your deck");
  const [meta, setMeta] = useState<DeckMeta>({
    dailyTarget: 15,
    cramMode: false,
    daysToCompetition: null,
    totalInRotation: 0,
    openAttackCount: 0,
  });
  const [sessionStreak, setSessionStreak] = useState(0);
  const [swipeHint, setSwipeHint] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/revision/flashcards?due=1");
      const data = (await res.json()) as {
        cards?: DueItem[];
        studying?: string[];
        dailyTarget?: number;
        cramMode?: boolean;
        daysToCompetition?: number | null;
        totalInRotation?: number;
        openAttackCount?: number;
        error?: string;
      };
      if (!res.ok) {
        setLoadError(data.error ?? "Could not load flashcards. Try again.");
        return;
      }
      const cards = data.cards ?? [];
      setItems(cards);
      setStudying(data.studying ?? []);
      setInitialCount(cards.length);
      setMeta({
        dailyTarget: data.dailyTarget ?? (cards.length || 15),
        cramMode: Boolean(data.cramMode),
        daysToCompetition: data.daysToCompetition ?? null,
        totalInRotation: data.totalInRotation ?? cards.length,
        openAttackCount: data.openAttackCount ?? 0,
      });
      setIdx(0);
      setFlipped(false);
      setSpoken(false);
      setSessionStreak(0);
      setSaveError(null);
      const first = cards[0]?.card;
      if (first) {
        setDeckLabel(first.deck || "your lead deck");
      }
    } catch {
      setLoadError("Could not load flashcards. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const currentItem = items[idx];
  const card = currentItem?.card;
  const state = currentItem?.state;
  const underAttack = Boolean(currentItem?.underAttack);
  const mastery =
    currentItem?.mastery != null ? currentItem.mastery : null;
  const doneCount = Math.max(0, initialCount - items.length);
  const progressPct =
    meta.dailyTarget === 0
      ? 0
      : Math.min(100, Math.round((doneCount / meta.dailyTarget) * 100));

  function applyStreakMood(nextStreak: number, missed: boolean) {
    if (missed) {
      setSessionStreak(0);
      emitMood({ type: "flashcard.miss" });
      return;
    }
    setSessionStreak(nextStreak);
    emitMood({ type: "flashcard.correct" });
    if (nextStreak >= 8) {
      emitMood({ type: "milestone", label: `${nextStreak} in a row. Keep going.` });
      emitCruxyEvent("personal_best");
      setBubble(`${nextStreak} in a row. Keep going.`);
    } else if (nextStreak >= 5) {
      setMood("excited");
      setBubble(`${nextStreak} streak. Nice.`);
    } else if (nextStreak >= 3) {
      emitCruxyEvent("feedback.answered_well");
      setBubble(`${nextStreak} in a row.`);
    }
  }

  function advanceAfter(currentIdx: number) {
    const next = items.filter((_, i) => i !== currentIdx);
    setItems(next);
    setIdx(0);
    setFlipped(false);
    setSpoken(false);
    if (next.length === 0) {
      emitMood({
        type: "milestone",
        label: meta.cramMode
          ? "Cram target done for today."
          : "Today's cards done.",
      });
      setBubble(
        meta.cramMode
          ? "Cram target done for today. One more round if you want."
          : "Today's cards done. Come back tomorrow.",
      );
    }
  }

  async function grade(kind: "got" | "missed") {
    const current = items[idx];
    if (!current || busy) return;
    setBusy(true);
    setSaveError(null);
    const g = kind === "got" ? 3 : 1;
    try {
      const res = await fetch("/api/revision/flashcards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "review",
          cardId: current.card.id,
          grade: g,
          mode: spoken ? "spoken" : "typed",
        }),
      });
      const data = (await res.json()) as {
        state?: { correct_streak?: number };
        mastery?: { mastery?: number } | null;
        error?: string;
      };
      if (!res.ok) {
        setSaveError(data.error ?? "Could not save. Try again.");
        return;
      }
      const streak =
        kind === "got"
          ? (data.state?.correct_streak ?? sessionStreak + 1)
          : 0;
      applyStreakMood(streak, kind === "missed");
      if (kind === "missed" && data.mastery?.mastery != null) {
        setBubble(
          `Node mastery now ${Math.round(data.mastery.mastery * 100)}%. Drill this claim again soon.`,
        );
      }
      advanceAfter(idx);
    } catch {
      setSaveError("Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function keepInDeck() {
    const current = items[idx];
    if (!current || busy) return;
    setBusy(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/revision/flashcards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "pin",
          cardId: current.card.id,
          pinned: true,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setSaveError(data.error ?? "Could not pin this card. Try again.");
        return;
      }
      setMood("winking");
      setBubble("Pinned. It stays in your deck.");
      const rest = items.filter((_, i) => i !== idx);
      const pinnedItem: DueItem = {
        ...current,
        state: { ...current.state, pinned: true },
      };
      setItems([...rest, pinnedItem]);
      setIdx(0);
      setFlipped(false);
      setSpoken(false);
    } catch {
      setSaveError("Could not pin this card. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const handlers = useSwipeable({
    onSwipedLeft: () => {
      if (!card || busy) return;
      setSwipeHint(false);
      if (!flipped) {
        setFlipped(true);
        return;
      }
      void grade("missed");
    },
    onSwipedRight: () => {
      if (!card || busy) return;
      setSwipeHint(false);
      if (!flipped) {
        setFlipped(true);
        return;
      }
      void grade("got");
    },
    onSwipedUp: () => {
      if (!card || !flipped || busy) return;
      setSwipeHint(false);
      void keepInDeck();
    },
    trackMouse: true,
    preventScrollOnSwipe: true,
    delta: 40,
  });

  const caseBadge =
    card?.deck?.match(/Case\s*\d+/i)?.[0] ?? (card ? "Deck" : "Flashcards");

  if (loading) {
    return (
      <main className="mx-auto flex min-h-[min(844px,100dvh)] w-full max-w-[390px] flex-col gap-3.5 p-4 sm:max-w-lg">
        <p className="text-sm text-muted" role="status">
          Loading your deck…
        </p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="mx-auto flex min-h-[min(844px,100dvh)] w-full max-w-[390px] flex-col gap-3.5 p-4 sm:max-w-lg">
        <p className="text-sm text-cardinal" role="alert">
          {loadError}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </main>
    );
  }

  const emptyMessage =
    meta.totalInRotation === 0
      ? "No cards in your decks yet. Leads get decks from the Evidence Library; others can opt in from the roadmap."
      : meta.cramMode
        ? "Cram target met for today. Refresh for another pass if you want."
        : "No cards left for today. Come back tomorrow, or refresh if you added a deck.";

  return (
    <main className="mx-auto flex min-h-[min(844px,100dvh)] w-full max-w-[390px] flex-col gap-3.5 p-4 sm:max-w-lg">
      <div className="flex items-center justify-between gap-3">
        <span className="font-display text-[26px] font-extrabold tracking-[-0.03em]">
          crux
        </span>
        <div className="flex flex-col items-end gap-0.5 text-right">
          <span className="text-xs font-bold text-muted">
            {items.length} left today
          </span>
          {studying[0] ? (
            <span className="text-[11px] text-muted">{studying[0]}</span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-[13px] font-bold">
            <span className="text-cardinal">{caseBadge}</span>
            <span className="text-muted"> {deckLabel}</span>
          </span>
          <span className="text-[11px] font-semibold text-muted">
            Target {meta.dailyTarget}
            {meta.cramMode ? " (cram)" : ""}
          </span>
        </div>
        {meta.cramMode ? (
          <span className="text-[11px] font-bold text-cardinal">
            Cram mode
            {meta.daysToCompetition != null
              ? `: ${meta.daysToCompetition} days to regional`
              : ""}
          </span>
        ) : null}
        {meta.openAttackCount > 0 ? (
          <span className="text-[11px] text-muted">
            {meta.openAttackCount} open attack
            {meta.openAttackCount === 1 ? "" : "s"} on your lead nodes
          </span>
        ) : null}
        <div
          className="h-1.5 overflow-hidden rounded-full bg-[#E3E5E9]"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Daily flashcard progress"
        >
          <div
            className="h-1.5 rounded-full bg-ink transition-[width] duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {sessionStreak > 0 ? (
          <span className="text-[11px] font-bold text-[#0F7B6C]" aria-live="polite">
            Streak {sessionStreak}
          </span>
        ) : null}
      </div>

      {saveError ? (
        <p className="text-sm text-cardinal" role="alert">
          {saveError}
        </p>
      ) : null}

      {card ? (
        <section className="flex flex-1 flex-col gap-3" {...handlers}>
          <button
            type="button"
            aria-label={flipped ? "Show question" : "Flip to answer"}
            onClick={() => {
              setFlipped((v) => !v);
              setSwipeHint(false);
            }}
            className="flash-scene relative min-h-[280px] w-full cursor-pointer border-0 bg-transparent p-0 text-left"
          >
            <div
              className={`flash-inner relative h-full min-h-[280px] w-full ${
                flipped ? "is-flipped" : ""
              }`}
            >
              <div className="flash-face flash-front absolute inset-0 flex flex-col gap-2.5 rounded-[20px] bg-ink p-[22px] text-white">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold tracking-[0.1em] text-gold">
                    {card.source_kind === "truth"
                      ? "TRUTH SOURCE"
                      : card.source_kind === "reading"
                        ? "FROM READING"
                        : "CARD"}
                  </span>
                  {underAttack ? (
                    <span className="rounded-md bg-cardinal px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
                      OPEN ATTACK
                    </span>
                  ) : null}
                </div>
                <p className="font-display m-0 flex-1 text-2xl font-semibold leading-tight">
                  {card.front}
                </p>
                {mastery != null ? (
                  <span className="text-[11px] font-medium text-[#9AA0AA]">
                    Node mastery {Math.round(mastery * 100)}%
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-[#9AA0AA]">
                    Tap or swipe to flip
                  </span>
                )}
              </div>
              <div className="flash-face flash-back absolute inset-0 flex flex-col gap-2.5 rounded-[20px] border-2 border-ink bg-white p-[22px]">
                <span className="text-[11px] font-bold tracking-[0.1em] text-muted">
                  ANSWER
                </span>
                <p className="m-0 flex-1 whitespace-pre-wrap text-base leading-relaxed">
                  {card.back}
                </p>
                {card.citation_ids.length ? (
                  <span className="self-start rounded-md bg-paper px-1.5 py-0.5 font-mono text-[11px] font-medium">
                    Evidence Library, {card.citation_ids.length} cite
                    {card.citation_ids.length === 1 ? "" : "s"}
                  </span>
                ) : (
                  <span className="self-start rounded-md bg-cardinal/10 px-1.5 py-0.5 font-mono text-[11px] text-cardinal">
                    Needs citation
                  </span>
                )}
                {state?.pinned ? (
                  <span className="self-start rounded-md bg-[#E8F0FE] px-1.5 py-0.5 text-[11px] font-bold text-[#1A56A8]">
                    Kept in your deck
                  </span>
                ) : null}
              </div>
            </div>
          </button>

          {swipeHint && flipped ? (
            <p className="text-center text-[11px] text-muted">
              Swipe right: Got it. Left: Missed. Up: Keep in my deck.
            </p>
          ) : null}

          <button
            type="button"
            aria-pressed={spoken}
            onClick={() => {
              setSpoken(true);
              setFlipped(true);
            }}
            className="h-12 rounded-xl border border-[#C9CCD3] bg-white text-sm font-semibold"
          >
            {spoken
              ? "Marking as said out loud"
              : "I said it out loud (self-grade)"}
          </button>
        </section>
      ) : (
        <section className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[20px] bg-white p-6 text-center text-sm text-muted">
          <p>{emptyMessage}</p>
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
            How did it go?
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void grade("missed")}
              className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl bg-[#FDECEC] text-sm font-bold text-cardinal disabled:opacity-60"
            >
              Missed it
            </button>
            <button
              type="button"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void keepInDeck()}
              className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl bg-white text-sm font-bold text-ink disabled:opacity-60"
            >
              Keep in my deck
            </button>
            <button
              type="button"
              disabled={busy}
              aria-busy={busy}
              onClick={() => void grade("got")}
              className="flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl bg-ink text-sm font-bold text-white disabled:opacity-60"
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
