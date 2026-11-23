"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { PageIntro } from "@/components/page-intro";
import { STUDY_DECK_META, type StudyDeckKind } from "@/lib/practice/study-decks";
import type { Flashcard } from "@/lib/revision/types";

type DueItem = { card: Flashcard; state: { due?: string } | null };

function DeckReviewInner() {
  const params = useParams<{ deck: string }>();
  const search = useSearchParams();
  const caseId = search.get("caseId");
  const deck = params.deck as StudyDeckKind;
  const meta = STUDY_DECK_META.find((m) => m.kind === deck);

  const [items, setItems] = useState<DueItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const q = new URLSearchParams({ deck });
    if (caseId) q.set("caseId", caseId);
    try {
      const res = await fetch(`/api/practice/study?${q.toString()}`);
      if (!res.ok) {
        setError("Could not load this deck. Try again.");
        return;
      }
      const data = (await res.json()) as { cards: DueItem[] };
      setItems(data.cards);
      setIdx(0);
      setFlipped(false);
      setError(null);
    } catch {
      setError("Could not load this deck. Try again.");
    } finally {
      setLoading(false);
    }
  }, [deck, caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = items[idx];

  async function grade(kind: "again" | "practice" | "got") {
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    const g = kind === "again" ? 1 : kind === "practice" ? 2 : 3;
    try {
      const res = await fetch("/api/practice/study", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "review",
          cardId: current.card.id,
          grade: g,
          mode: "typed",
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Could not save. Try again.");
        return;
      }
      const next = items.filter((_, i) => i !== idx);
      setItems(next);
      setIdx(0);
      setFlipped(false);
    } catch {
      setError("Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!meta) {
    return <p className="text-sm text-cardinal">Unknown deck.</p>;
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-5 animate-fade-up pb-10">
      <PageIntro title={meta.title}>{meta.blurb}</PageIntro>

      <p className="m-0 text-sm text-muted">
        {loading ? "Loading…" : `${items.length} due today`}
        {!loading && caseId ? " for this case" : ""}.
      </p>

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

      {!loading && !current ? (
        <div className="rounded-[20px] bg-white p-6">
          <p className="m-0 text-sm">
            Nothing due in this deck. Come back tomorrow, or open another deck.
          </p>
          <Link
            href="/practice/study"
            className="mt-3 inline-block text-sm font-semibold underline"
          >
            All decks
          </Link>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="min-h-[200px] w-full rounded-[20px] border-2 border-ink bg-white px-5 py-6 text-left"
            onClick={() => setFlipped((f) => !f)}
          >
            <p className="m-0 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              {flipped ? "Back" : "Front"}, tap to flip
            </p>
            <p className="mt-3 whitespace-pre-wrap text-[17px] font-semibold leading-snug">
              {flipped ? current.card.back : current.card.front}
            </p>
          </button>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={busy || !flipped}
              onClick={() => void grade("again")}
              className="h-12 rounded-xl border border-ink/15 bg-white text-sm font-semibold disabled:opacity-40"
            >
              Again
            </button>
            <button
              type="button"
              disabled={busy || !flipped}
              onClick={() => void grade("practice")}
              className="h-12 rounded-xl border border-ink/15 bg-white text-sm font-semibold disabled:opacity-40"
            >
              Practice more
            </button>
            <button
              type="button"
              disabled={busy || !flipped}
              onClick={() => void grade("got")}
              className="h-12 rounded-xl bg-cardinal text-sm font-semibold text-white disabled:opacity-40"
            >
              Got it
            </button>
          </div>
        </>
      )}

      <Link href="/practice/study" className="text-sm underline text-muted">
        Back to decks
      </Link>
    </main>
  );
}

export default function PracticeStudyDeckPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading deck…</p>}>
      <DeckReviewInner />
    </Suspense>
  );
}
