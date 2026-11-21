"use client";

import { useEffect, useState } from "react";

type Seat = { seat: number; question: string; followUp: string };

/** F-251: show Cruxy judge Q&A seats out loud (question + follow-up). */
export function CruxyJudgeQa({
  roundId,
  dark = false,
}: {
  roundId: string;
  dark?: boolean;
}) {
  const [seats, setSeats] = useState<Seat[]>([]);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shell = dark
    ? "rounded-[20px] border border-[#262934] bg-[#16181F] p-5 text-white"
    : "rounded-[20px] bg-white p-5";
  const muted = dark ? "text-[#8C929D]" : "text-muted";
  const card = dark ? "rounded-[14px] bg-[#0C0D11] px-4 py-3" : "rounded-[14px] bg-[#F7F8FA] px-4 py-3";
  const body = dark ? "text-[#C9CCD3]" : "text-[#3B404A]";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/practice/rounds/${roundId}/judge-qa`);
        const data = (await res.json()) as {
          seats?: Seat[];
          empty?: boolean;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Could not load Q&A");
        if (cancelled) return;
        setSeats(data.seats ?? []);
        setEmpty(Boolean(data.empty));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roundId]);

  if (error) {
    return <p className="text-sm text-cardinal">{error}</p>;
  }

  if (empty || seats.length === 0) {
    return (
      <section className={shell}>
        <h2 className="font-display m-0 text-xl font-extrabold">
          Judges&apos; Q&A
        </h2>
        <p className={`mt-2 text-sm ${muted}`}>
          No Cruxy judge questions yet. They appear when Cruxy is judging this
          round.
        </p>
      </section>
    );
  }

  return (
    <section className={shell}>
      <h2 className="font-display m-0 text-xl font-extrabold">
        Judges&apos; Q&A (Cruxy)
      </h2>
      <p className={`mt-1 text-sm ${muted}`}>
        One question and one follow-up per judge seat. Read them out loud.
      </p>
      <ul className="mt-4 space-y-3">
        {seats.map((s) => (
          <li key={s.seat} className={card}>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-gold px-2 py-0.5 text-[11px] font-bold text-[#0C0D11]">
                Seat {s.seat}
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold leading-snug">
              {s.question}
            </p>
            <p className={`mt-1 text-sm leading-snug ${body}`}>
              <span className="font-semibold">Follow-up:</span> {s.followUp}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
