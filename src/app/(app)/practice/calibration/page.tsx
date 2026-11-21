"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Point = {
  id: string;
  round_id: string;
  brier: number;
  predicted_mean: number | null;
  actual_mean: number | null;
  created_at: string;
  case_number: number | null;
};

/**
 * Personal prediction calibration. Compared only with your own past.
 * Never ranked against other people.
 */
export default function CalibrationPage() {
  const [points, setPoints] = useState<Point[]>([]);
  const [latest, setLatest] = useState<number | null>(null);
  const [vsOwnPast, setVsOwnPast] = useState<
    "better" | "same" | "worse" | "first" | null
  >(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void fetch("/api/practice/predictions/mine")
      .then((r) => r.json())
      .then(
        (d: {
          points?: Point[];
          latest?: number | null;
          vsOwnPast?: "better" | "same" | "worse" | "first" | null;
        }) => {
          setPoints(d.points ?? []);
          setLatest(d.latest ?? null);
          setVsOwnPast(d.vsOwnPast ?? null);
          setLoaded(true);
        },
      )
      .catch(() => setLoaded(true));
  }, []);

  const maxBrier = Math.max(0.01, ...points.map((p) => p.brier), 1);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-6">
      <div>
        <Link href="/practice" className="text-sm text-muted underline">
          Practice
        </Link>
        <h1 className="font-display m-0 mt-2 text-3xl font-extrabold">
          Your score predictions
        </h1>
        <p className="mt-1 text-sm text-muted">
          How close your guesses were to the scores you got. Compared only with
          your own past, never with other people.
        </p>
      </div>

      {!loaded ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : points.length === 0 ? (
        <section className="rounded-[20px] bg-white p-5">
          <p className="m-0 text-sm text-muted">
            No scored predictions yet. Before your next practice round, predict
            each card item and the judge question you expect. After judging,
            your trend appears here.
          </p>
        </section>
      ) : (
        <>
          <section className="rounded-[20px] bg-ink p-5 text-white">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-gold">
              Latest Brier
            </span>
            <p className="font-display m-0 mt-2 text-4xl font-extrabold">
              {latest != null ? latest.toFixed(3) : "Not set"}
            </p>
            <p className="mt-2 text-sm text-[#C9CCD3]">
              {vsOwnPast === "better"
                ? "Better than your previous round (lower is better)."
                : vsOwnPast === "worse"
                  ? "Higher than your previous round. Keep practising predictions."
                  : vsOwnPast === "same"
                    ? "About the same as your previous round."
                    : vsOwnPast === "first"
                      ? "First scored prediction. Your trend starts here."
                      : "Not set"}
            </p>
          </section>

          <section className="rounded-[20px] bg-white p-5">
            <h2 className="font-display m-0 text-xl font-extrabold">
              Your trend
            </h2>
            <p className="mt-1 text-xs text-muted">
              Lower bars mean sharper forecasts over the APPE score bands.
            </p>
            <div className="mt-4 flex items-end gap-2" style={{ height: 140 }}>
              {[...points].reverse().map((p) => {
                const h = Math.max(8, (p.brier / maxBrier) * 120);
                return (
                  <div
                    key={p.id}
                    className="flex flex-1 flex-col items-center justify-end gap-1"
                    title={`Brier ${p.brier.toFixed(3)}`}
                  >
                    <div
                      className="w-full max-w-[36px] rounded-t-md bg-cardinal"
                      style={{ height: h }}
                    />
                    <span className="text-[10px] text-muted">
                      {p.case_number != null ? `C${p.case_number}` : "R"}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-[20px] bg-white p-5">
            <h2 className="font-display m-0 text-xl font-extrabold">
              Recent rounds
            </h2>
            <ul className="mt-3 list-none space-y-3 p-0">
              {points.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-3 text-sm first:border-0 first:pt-0"
                >
                  <span>
                    {p.case_number != null
                      ? `Case ${p.case_number}`
                      : "Practice round"}
                    <span className="ml-2 text-xs text-muted">
                      {new Date(p.created_at).toLocaleDateString()}
                    </span>
                  </span>
                  <span className="font-mono text-xs">
                    Brier {p.brier.toFixed(3)}
                    {p.predicted_mean != null && p.actual_mean != null
                      ? ` (guess ${p.predicted_mean.toFixed(1)}, got ${p.actual_mean.toFixed(1)})`
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
