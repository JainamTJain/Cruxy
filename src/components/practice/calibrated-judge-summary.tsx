"use client";

import { MIN_ANALYSED_CARDS } from "@/lib/practice/calibrated-judge-constants";

type Calibrated = {
  enough: boolean;
  message: string;
  n_cards: number;
  overall_kappa: number | null;
};

/** Wave 6 C: Cruxy score with bias-corrected interval and kappa on the report. */
export function CalibratedJudgeSummary({
  calibrated,
}: {
  calibrated: Calibrated | null | undefined;
}) {
  if (!calibrated) {
    return (
      <p className="rounded-[14px] bg-[#F7F8FA] px-4 py-3 text-sm text-muted">
        Not enough human cards yet
      </p>
    );
  }

  return (
    <section className="rounded-[20px] bg-white p-5">
      <h2 className="font-display m-0 text-xl font-extrabold">
        Calibrated Cruxy
      </h2>
      <p className="mt-1 text-sm text-muted">
        Chance-corrected agreement (kappa), not raw matches. Interval is
        bias-corrected from analysed human cards.
      </p>
      <p className="mt-3 text-sm leading-snug text-[#1C1F26]">
        {calibrated.message}
      </p>
      {!calibrated.enough ? (
        <p className="mt-2 text-xs text-muted">
          Needs {MIN_ANALYSED_CARDS} analysed human cards beside Cruxy. Have{" "}
          {calibrated.n_cards} so far.
        </p>
      ) : null}
    </section>
  );
}
