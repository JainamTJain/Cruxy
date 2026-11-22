"use client";

import Link from "next/link";
import { CountUp } from "@/components/motion/count-up";

type Props = {
  daysLeft: number | null;
  competitionLabel: string | null;
  leadCase: { id: string; number: number; title: string } | null;
  nextDrillHref: string;
};

/** Compact Dec 5 strip: days left, lead case, next drill. */
export function WinStrip({
  daysLeft,
  competitionLabel,
  leadCase,
  nextDrillHref,
}: Props) {
  return (
    <div className="flex flex-col gap-3 rounded-[18px] bg-cardinal px-4 py-3.5 text-white sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex items-center gap-3">
        {daysLeft != null ? (
          <span className="font-display text-[40px] font-extrabold leading-none tabular-nums">
            <CountUp value={daysLeft} />
          </span>
        ) : (
          <span className="font-display text-2xl font-extrabold">Soon</span>
        )}
        <span className="text-sm leading-snug">
          days to UCSB
          {competitionLabel ? (
            <>
              <br />
              <span className="text-[#F3D0D6]">{competitionLabel}</span>
            </>
          ) : null}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {leadCase ? (
          <Link
            href={`/case-brain/${leadCase.id}`}
            className="rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold hover:bg-white/25"
          >
            Case {leadCase.number}
          </Link>
        ) : null}
        <Link
          href={nextDrillHref}
          className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-ink"
        >
          Judges&apos; Q&A
        </Link>
        <Link
          href="/revision/warmup"
          className="rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold hover:bg-white/25"
        >
          Warm-up
        </Link>
      </div>
    </div>
  );
}
