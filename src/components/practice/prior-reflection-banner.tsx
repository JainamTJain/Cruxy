"use client";

import { useEffect, useState } from "react";

type Props = {
  caseId: string | null | undefined;
};

/**
 * Shows the last reflection for this case when starting a new round.
 */
export function PriorReflectionBanner({ caseId }: Props) {
  const [note, setNote] = useState<{
    went_well: string;
    one_change: string;
    confidence: number;
  } | null>(null);

  useEffect(() => {
    if (!caseId) return;
    void fetch(
      `/api/practice/reflections/latest?caseId=${encodeURIComponent(caseId)}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (d: {
          reflection?: {
            went_well: string;
            one_change: string;
            confidence: number;
          } | null;
        } | null) => {
          if (d?.reflection) setNote(d.reflection);
        },
      )
      .catch(() => undefined);
  }, [caseId]);

  if (!note) return null;

  return (
    <section className="rounded-[20px] border border-[#262934] bg-[#16181F] p-4 text-[#F2F3F5]">
      <h2 className="m-0 text-sm font-bold">Last time on this case</h2>
      <p className="mt-2 text-sm">
        <span className="text-[#8C929D]">Went well: </span>
        {note.went_well || "(blank)"}
      </p>
      <p className="mt-1 text-sm">
        <span className="text-[#8C929D]">One change: </span>
        {note.one_change || "(blank)"}
      </p>
      <p className="mt-1 text-sm text-[#8C929D]">
        You felt {note.confidence}% sure.
      </p>
    </section>
  );
}
