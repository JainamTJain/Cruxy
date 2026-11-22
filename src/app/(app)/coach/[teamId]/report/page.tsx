"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Member = {
  name: string;
  lastPractisedAt: string | null;
  stale: boolean;
  attendancePresent: number;
  attendanceTotal: number;
  roadmapLine: string;
};

type BriefItem = {
  caseNumber: number | null;
  text: string;
  kind: string;
};

type Snap = {
  teamId: string;
  teamName: string;
  members: Member[];
  openBriefItems: BriefItem[];
  generatedAt: string;
};

/** Printable weekly team report for Dr. B. */
export default function CoachReportPage() {
  const params = useParams<{ teamId: string }>();
  const [snap, setSnap] = useState<Snap | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/coach/teams/${params.teamId}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json()) as { error?: string };
          throw new Error(j.error ?? "Forbidden");
        }
        return r.json() as Promise<Snap>;
      })
      .then(setSnap)
      .catch((e: Error) => setError(e.message));
  }, [params.teamId]);

  if (error) {
    return <p className="p-6 text-sm text-cardinal">{error}</p>;
  }
  if (!snap) {
    return <p className="p-6 text-sm text-muted">Loading report…</p>;
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 bg-white px-6 py-8 text-ink print:max-w-none">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/coach/${snap.teamId}`} className="text-sm underline">
          Back
        </Link>
        <button
          type="button"
          className="rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-white"
          onClick={() => window.print()}
        >
          Print
        </button>
      </div>

      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Weekly team report
        </p>
        <h1 className="font-display text-3xl font-semibold">{snap.teamName}</h1>
        <p className="mt-1 text-sm text-muted">
          {new Date(snap.generatedAt).toLocaleString()}. Progress is each
          person against their own past only.
        </p>
      </header>

      <section>
        <h2 className="font-display text-xl font-semibold">People</h2>
        <ul className="mt-3 space-y-3 text-sm">
          {snap.members.map((m) => (
            <li key={m.name} className="border-b border-ink/10 pb-2">
              <p className="font-semibold">
                {m.name}
                {m.stale ? " (5+ days without practice)" : ""}
              </p>
              <p>
                Attendance {m.attendancePresent}/{m.attendanceTotal}. Last
                practice{" "}
                {m.lastPractisedAt
                  ? new Date(m.lastPractisedAt).toLocaleDateString()
                  : "never"}
                .
              </p>
              <p>{m.roadmapLine}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold">
          Open Team Brief items
        </h2>
        {snap.openBriefItems.length === 0 ? (
          <p className="mt-2 text-sm text-muted">None open.</p>
        ) : (
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {snap.openBriefItems.map((item, i) => (
              <li key={i}>
                Case {item.caseNumber ?? "?"}: {item.text} ({item.kind})
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
