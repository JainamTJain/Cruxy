"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Working = {
  hypothesis: string;
  correlationNote?: string;
  usage: {
    feature: string;
    uses: number;
    unique_people: number;
    useful_marks: number;
  }[];
  totals: Record<string, number>;
  signedIn: number;
  rosterSize: number;
  ignored: string[];
  outcomes?: {
    sampleSize: number;
    avgDelta: number | null;
    liftRate: number | null;
    judgeAgreeRate: number | null;
    usefulFeedback: number;
    note: string;
  };
};

export default function WorkingPage() {
  const [data, setData] = useState<Working | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/admin/working")
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json()) as { error?: string };
          throw new Error(j.error ?? "Forbidden");
        }
        return r.json() as Promise<Working>;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <main className="animate-fade-up space-y-3">
        <p className="text-sm text-cardinal">{error}</p>
        <Link href="/admin" className="text-sm underline">
          Back
        </Link>
      </main>
    );
  }
  if (!data) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <main className="animate-fade-up space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-cardinal">
          Only Jainam
        </p>
        <h1 className="font-display text-3xl font-semibold">Is Crux working?</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">{data.hypothesis}</p>
        {data.correlationNote ? (
          <p className="mt-2 max-w-2xl text-sm">{data.correlationNote}</p>
        ) : null}
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-ink/10 bg-white/60 px-4 py-3">
          <p className="text-xs text-muted">Signed in</p>
          <p className="font-display text-2xl">
            {data.signedIn}/{data.rosterSize}
          </p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-white/60 px-4 py-3">
          <p className="text-xs text-muted">Rounds graded</p>
          <p className="font-display text-2xl">{data.totals.rounds_graded}</p>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-white/60 px-4 py-3">
          <p className="text-xs text-muted">Redo improvements</p>
          <p className="font-display text-2xl">{data.totals.redo_improvements}</p>
        </div>
      </section>

      {data.outcomes ? (
        <section className="space-y-2 rounded-2xl border border-ink/10 bg-white/60 px-4 py-3">
          <h2 className="font-display text-xl font-semibold">
            Outcomes grade Cruxy
          </h2>
          <p className="text-sm text-muted">{data.outcomes.note}</p>
          <ul className="grid gap-2 text-sm sm:grid-cols-3">
            <li>
              Sample size:{" "}
              <span className="font-mono">{data.outcomes.sampleSize}</span>
            </li>
            <li>
              Avg score delta:{" "}
              <span className="font-mono">
                {data.outcomes.avgDelta == null
                  ? "Not set"
                  : data.outcomes.avgDelta.toFixed(2)}
              </span>
            </li>
            <li>
              Lift rate:{" "}
              <span className="font-mono">
                {data.outcomes.liftRate == null
                  ? "Not set"
                  : `${Math.round(data.outcomes.liftRate * 100)}%`}
              </span>
            </li>
            <li>
              Judge agree:{" "}
              <span className="font-mono">
                {data.outcomes.judgeAgreeRate == null
                  ? "Not set"
                  : `${Math.round(data.outcomes.judgeAgreeRate * 100)}%`}
              </span>
            </li>
            <li>
              Useful marks:{" "}
              <span className="font-mono">
                {data.outcomes.usefulFeedback}
              </span>
            </li>
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="font-display text-xl font-semibold">Feature use</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {data.usage.map((u) => (
            <li
              key={u.feature}
              className="flex justify-between rounded-xl border border-ink/5 bg-white/50 px-3 py-2"
            >
              <span>
                {u.feature}{" "}
                <span className="text-xs text-muted">
                  {u.unique_people} people, {u.useful_marks} useful
                </span>
              </span>
              <span className="font-mono">{u.uses}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold">Ignored / unused</h2>
        <p className="mt-2 text-sm text-muted">
          {data.ignored.length ? data.ignored.join(", ") : "Nothing flagged yet."}
        </p>
      </section>

      <Link href="/admin" className="text-sm underline">
        Back to admin
      </Link>
    </main>
  );
}
