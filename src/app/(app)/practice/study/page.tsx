"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PageIntro } from "@/components/page-intro";
import type { StudyDeckKind } from "@/lib/practice/study-decks";

type Deck = {
  kind: StudyDeckKind;
  title: string;
  blurb: string;
  dueToday: number;
  total: number;
};

function StudyHubInner() {
  const search = useSearchParams();
  const caseId = search.get("caseId");
  const [decks, setDecks] = useState<Deck[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      await fetch("/api/practice/study", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const res = await fetch("/api/practice/study");
      if (!res.ok) {
        setError("Could not load decks.");
        return;
      }
      const data = (await res.json()) as { decks: Deck[] };
      setDecks(data.decks);
      setError(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 animate-fade-up pb-10">
      <PageIntro title="Study">
        Flashcards by your role. Cases you lead first, then counter, support,
        then every one pager. Due counts are for today.
      </PageIntro>

      {caseId ? (
        <p className="m-0 rounded-[14px] bg-[#F7F8FA] px-4 py-3 text-sm text-muted">
          Linked from a case. Open a deck, then filter to that case inside the
          review if you want.
        </p>
      ) : null}

      {error ? <p className="text-sm text-cardinal">{error}</p> : null}

      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {decks.map((d) => (
          <li key={d.kind}>
            <Link
              href={`/practice/study/${d.kind}${caseId ? `?caseId=${encodeURIComponent(caseId)}` : ""}`}
              className="flex flex-col gap-1 rounded-[20px] border border-ink/10 bg-white px-5 py-4 hover:bg-[#F7F8FA]"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-display text-lg font-extrabold">
                  {d.title}
                </span>
                <span className="rounded-lg bg-ink px-2.5 py-1 text-xs font-bold text-white">
                  {d.dueToday} due
                </span>
              </span>
              <span className="text-sm text-muted">{d.blurb}</span>
              <span className="text-xs text-muted">{d.total} cards in deck</span>
            </Link>
          </li>
        ))}
        {decks.length === 0 && !busy ? (
          <li className="rounded-[20px] bg-white p-5 text-sm text-muted">
            No decks yet. Set case roles and draft a one pager, then refresh.
          </li>
        ) : null}
      </ul>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/practice/solo-qa" className="underline text-muted">
          Solo question practice
        </Link>
        <Link href="/practice" className="underline text-muted">
          All practice
        </Link>
        <button
          type="button"
          className="underline text-muted"
          disabled={busy}
          onClick={() => void load()}
        >
          Refresh decks
        </button>
      </div>
    </main>
  );
}

export default function PracticeStudyPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading study…</p>}>
      <StudyHubInner />
    </Suspense>
  );
}
