"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LoadingGenie } from "@/components/cruxy/mood/loading-genie";
import {
  TodayFocus,
  WinStrip,
  OneTapJudgeDrill,
  PreRoundCalmCta,
  PreRoundWarmupCta,
} from "@/components/product";
import { TailoredLine } from "@/components/learning/tailored-line";
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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const ac = new AbortController();
    const timeout = window.setTimeout(() => ac.abort(), 15_000);
    try {
      const r = await fetch("/api/product/today", { signal: ac.signal });
      if (!r.ok) throw new Error("Could not load Today");
      const json = (await r.json()) as Payload;
      setData(json);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setError("Today is taking too long. Check signal and try again.");
      } else {
        setError(e instanceof Error ? e.message : "Could not load Today");
      }
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !data) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 pb-10">
        <p className="text-sm text-cardinal">{error}</p>
        <button
          type="button"
          className="w-fit min-h-11 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white"
          onClick={() => void load()}
        >
          Try again
        </button>
      </main>
    );
  }
  if (loading && !data) {
    return <LoadingGenie label="Loading Today..." />;
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
        <h1 className="font-display mt-1 text-[36px] font-extrabold leading-none tracking-[-0.02em] sm:text-[48px]">
          Hi {data.personName.split(" ")[0]}
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted">
          Three things. Then stop. The program board is one tap away if you need
          it.
        </p>
        <div className="mt-3">
          <TailoredLine />
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-cardinal/30 bg-cardinal/5 px-3 py-2 text-sm text-cardinal">
          {error}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => void load()}
          >
            Retry
          </button>
        </p>
      ) : null}

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
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 [&>*]:w-full [&>*]:whitespace-nowrap [&>*]:justify-center">
          <PreRoundCalmCta caseId={data.leadCase?.id} />
          <PreRoundWarmupCta caseId={data.leadCase?.id} />
          <OneTapJudgeDrill caseId={data.leadCase?.id} />
          <Link
            href="/regional"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white"
          >
            Round card and timer
          </Link>
          {Date.now() >= Date.UTC(2026, 11, 5, 8) ? (
            <Link
              href="/season"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-ink/15 bg-white px-4 py-3 text-sm font-semibold text-ink"
            >
              After the regional
            </Link>
          ) : null}
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
