"use client";

import { useEffect, useState } from "react";

type Props = {
  /** When set, load the last reflection for this case. Otherwise the latest overall. */
  caseId?: string | null;
  /** Compact strip for session start; full card for round setup. */
  compact?: boolean;
};

/**
 * Carries the last "one thing to change" into the next practice the person starts.
 */
export function PriorReflectionBanner({ caseId, compact }: Props) {
  const [note, setNote] = useState<{
    went_well: string;
    one_change: string;
    confidence: number;
  } | null>(null);

  useEffect(() => {
    const q =
      caseId != null && caseId !== ""
        ? `?caseId=${encodeURIComponent(caseId)}`
        : "";
    void fetch(`/api/practice/reflections/latest${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (d: {
          reflection?: {
            went_well: string;
            one_change: string;
            confidence: number;
          } | null;
        } | null) => {
          if (d?.reflection?.one_change?.trim()) setNote(d.reflection);
        },
      )
      .catch(() => undefined);
  }, [caseId]);

  if (!note?.one_change?.trim()) return null;

  if (compact) {
    return (
      <section className="rounded-[16px] border border-cardinal/20 bg-white px-4 py-3 text-ink">
        <p className="m-0 text-[11px] font-bold uppercase tracking-[0.12em] text-cardinal">
          Focus from last time
        </p>
        <p className="m-0 mt-1 text-sm font-semibold leading-snug">
          {note.one_change}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[20px] border border-[#F2C14E]/40 bg-[#16181F] p-4 text-[#F2F3F5]">
      <p className="m-0 text-[11px] font-bold uppercase tracking-[0.12em] text-gold">
        Focus this round
      </p>
      <p className="m-0 mt-2 text-base font-semibold leading-snug">
        {note.one_change}
      </p>
      {note.went_well ? (
        <p className="mt-2 text-sm text-[#8C929D]">
          Last time went well: {note.went_well}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-[#8C929D]">
        You felt {note.confidence}% sure. From your last reflection.
      </p>
    </section>
  );
}
