"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LoadingGenie } from "@/components/cruxy/mood/loading-genie";
import {
  TodayFocus,
  WinStrip,
  OneTapJudgeDrill,
  PreRoundWarmupCta,
} from "@/components/product";
import type { TodayAction } from "@/lib/product/today";

type Payload = {
  personName: string;
  todayLabel: string | null;
  daysToCompetition: number | null;
  competition: { name: string; date: string; place: string | null } | null;
  actions: TodayAction[];
  leadCase: { id: string; number: number; title: string } | null;
  nextDrillHref: string;
};

export default function TodayPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/product/today")
      .then(async (r) => {
        if (!r.ok) throw new Error("Could not load Today");
        return r.json() as Promise<Payload>;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return <p className="text-sm text-cardinal">{error}</p>;
  }
  if (!data) {
    return <LoadingGenie label="Loading Today..." />;
  }

  const competitionLabel = data.competition
    ? `${data.competition.name}${data.competition.place ? `, ${data.competition.place}` : ""}`
    : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 animate-fade-up pb-10">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
          {data.todayLabel ?? "Today"}
        </p>
        <h1 className="font-display mt-1 text-[40px] font-extrabold leading-none tracking-[-0.02em] sm:text-[48px]">
          Hi {data.personName.split(" ")[0]}
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted">
          Three things. Then stop. The program board is one tap away if you need
          it.
        </p>
      </div>

      <WinStrip
        daysLeft={data.daysToCompetition}
        competitionLabel={competitionLabel}
        leadCase={data.leadCase}
        nextDrillHref={data.nextDrillHref}
      />

      <TodayFocus actions={data.actions} />

      <section className="flex flex-col gap-2 rounded-[20px] bg-white p-5">
        <h2 className="font-display m-0 text-lg font-extrabold">
          Win Dec 5 helpers
        </h2>
        <p className="m-0 text-xs text-muted">
          Warm up the morning of a round. Drill Judges&apos; Q&A often. On the
          day, open your round card and the APPE timer on your phone.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <PreRoundWarmupCta caseId={data.leadCase?.id} />
          <OneTapJudgeDrill caseId={data.leadCase?.id} />
          <Link
            href="/regional"
            className="inline-flex items-center justify-center rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white"
          >
            Round card and timer
          </Link>
        </div>
      </section>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/home" className="underline text-muted">
          Full program map
        </Link>
        <Link href="/revision/roadmap" className="underline text-muted">
          My roadmap
        </Link>
        <Link href="/practice" className="underline text-muted">
          All practice modes
        </Link>
      </div>
    </main>
  );
}
