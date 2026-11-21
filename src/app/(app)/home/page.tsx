"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Team = { id: string; name: string; colour: string };
type CaseRow = { id: string; number: number; title: string };
type Cell = {
  team_id: string;
  case_id: string;
  readiness_pct: number;
  lead_names: string[];
  latest_event: string | null;
};
type Change = {
  id: string;
  action: string;
  personName: string;
  target: string | null;
  at: string;
  meta?: Record<string, unknown> | null;
};
type NextAction = {
  label: string;
  detail: string;
  href: string;
};

type MapData = {
  teams: Team[];
  cases: CaseRow[];
  readiness: Cell[];
  totals: Record<string, number>;
  deltas?: Record<string, string>;
  teamAverages: { team_id: string; avg: number; delta_week: number }[];
  competition: { name: string; date: string; place: string | null } | null;
  daysToCompetition: number | null;
  changes: Change[];
  nextActions: string[] | NextAction[];
  todayLabel?: string;
};

function initials(names: string[]): string {
  if (!names.length) return "Not set";
  return names
    .map((n) => {
      const parts = n.trim().split(/\s+/);
      if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
      return `${parts[0]!.slice(0, 1)}·${parts[parts.length - 1]!.slice(0, 1)}`;
    })
    .join(" ");
}

export default function HomePage() {
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/program-map")
      .then(async (r) => {
        if (!r.ok) throw new Error("Could not load program map");
        return r.json() as Promise<MapData>;
      })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  const todayLabel = useMemo(() => {
    if (data?.todayLabel) return data.todayLabel;
    return new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }, [data?.todayLabel]);

  if (error) {
    return <p className="text-sm text-cardinal">{error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted">Loading program map…</p>;
  }

  const cellFor = (teamId: string, caseId: string) =>
    data.readiness.find((c) => c.team_id === teamId && c.case_id === caseId);

  const totals: {
    key: string;
    label: string;
    delta?: string;
  }[] = [
    {
      key: "drive_files",
      label: "Drive files read",
      delta: data.deltas?.drive_files,
    },
    {
      key: "ideas_accepted",
      label: "ideas accepted",
      delta: data.deltas?.ideas_accepted,
    },
    {
      key: "sources_verified",
      label: "sources verified",
      delta: data.deltas?.sources_verified,
    },
    {
      key: "bank_questions",
      label: "bank questions",
      delta: data.deltas?.bank_questions,
    },
    {
      key: "rounds_graded",
      label: "rounds graded",
      delta: data.deltas?.rounds_graded,
    },
    {
      key: "redo_improvements",
      label: "redos that improved",
      delta: data.deltas?.redo_improvements,
    },
  ];

  const nextThree: NextAction[] = (data.nextActions ?? []).map((a, i) => {
    if (typeof a === "string") {
      return {
        label: i === 0 ? "DO NEXT" : "NEXT",
        detail: a,
        href: "/revision/roadmap",
      };
    }
    return a;
  });

  const teamColour = (t: Team) => t.colour;

  return (
    <main className="flex flex-col gap-7 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            {todayLabel}
          </span>
          <h1 className="font-display m-0 text-[56px] font-extrabold leading-[0.95] tracking-[-0.03em]">
            Where the program stands
          </h1>
        </div>
        {data.daysToCompetition != null && data.competition ? (
          <div className="flex items-center gap-4 rounded-[18px] bg-cardinal px-5 py-3.5 text-white">
            <span className="font-display text-[52px] font-extrabold leading-none">
              {data.daysToCompetition}
            </span>
            <span className="text-sm leading-snug">
              days to UCSB
              <br />
              <span className="text-[#F3D0D6]">
                {data.competition.place
                  ? `${data.competition.name}, ${data.competition.date}`
                  : `Regional, ${data.competition.date}`}
              </span>
            </span>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {totals.map((t) => (
          <div key={t.key} className="rounded-2xl bg-white p-4">
            <div className="font-display text-[44px] font-extrabold leading-none">
              {data.totals[t.key] ?? 0}
            </div>
            <div className="mt-1.5 text-[13px] text-muted">{t.label}</div>
            {t.delta ? (
              <div className="mt-1 text-xs font-bold text-[#0F7B6C]">
                {t.delta}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section className="min-w-0 flex-[999_1_640px] overflow-hidden rounded-[20px] bg-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-3 pt-5">
            <h2 className="font-display m-0 text-2xl font-extrabold">
              Case board
            </h2>
            <span className="text-[13px] text-muted">
              Readiness per team · leads · latest
            </span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[220px_repeat(3,minmax(0,1fr))] border-t border-[#E3E5E9] bg-[#F7F8FA] text-[13px] font-bold">
                <span className="px-5 py-2.5">Case</span>
                {data.teams.map((t) => (
                  <span
                    key={t.id}
                    className="border-l border-[#E3E5E9] px-3.5 py-2.5"
                    style={{ color: teamColour(t) }}
                  >
                    {t.name}
                  </span>
                ))}
              </div>
              {data.cases.map((c) => (
                <Link
                  key={c.id}
                  href={`/case-brain/${c.id}`}
                  className="grid grid-cols-[220px_repeat(3,minmax(0,1fr))] border-t border-[#E3E5E9]"
                >
                  <span className="flex items-center gap-3 px-5 py-3">
                    <span className="font-display w-[34px] text-[26px] font-extrabold text-cardinal">
                      {c.number}
                    </span>
                    <span className="text-sm font-semibold leading-snug">
                      {c.title}
                    </span>
                  </span>
                  {data.teams.map((t) => {
                    const cell = cellFor(t.id, c.id);
                    const pct = cell?.readiness_pct ?? 0;
                    return (
                      <span
                        key={t.id}
                        className="flex flex-col gap-1.5 border-l border-[#E3E5E9] px-3.5 py-3"
                      >
                        <span className="flex items-center justify-between">
                          <span className="font-mono text-[13px] font-semibold">
                            {pct}%
                          </span>
                          <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-md bg-paper px-1 text-[11px] font-bold text-[#3B404A]">
                            {initials(cell?.lead_names ?? [])}
                          </span>
                        </span>
                        <span className="h-2 overflow-hidden rounded-full bg-[#ECEEF1]">
                          <span
                            className="block h-2 rounded-full"
                            style={{
                              width: `${pct}%`,
                              background: teamColour(t),
                            }}
                          />
                        </span>
                        <span className="text-xs text-muted">
                          {cell?.latest_event || "\u00a0"}
                        </span>
                      </span>
                    );
                  })}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
          <section className="flex flex-col gap-3 rounded-[20px] bg-ink p-5 text-white">
            <h2 className="font-display m-0 text-[22px] font-extrabold">
              Your next three
            </h2>
            {nextThree.length === 0 ? (
              <p className="text-sm text-[#9AA0AA]">Nothing overdue. Nice work.</p>
            ) : (
              nextThree.slice(0, 3).map((a) => (
                <Link
                  key={a.detail}
                  href={a.href}
                  className="flex flex-col gap-1 rounded-xl bg-[#1E2129] p-3"
                >
                  <span className="text-xs font-bold text-gold">{a.label}</span>
                  <span className="text-[15px] leading-snug">{a.detail}</span>
                </Link>
              ))
            )}
          </section>

          <section className="flex flex-col gap-3.5 rounded-[20px] bg-white p-5">
            <h2 className="font-display m-0 text-[22px] font-extrabold">
              Since you were here
            </h2>
            <div className="flex flex-col gap-3 text-sm leading-snug">
              {data.changes.length === 0 ? (
                <span className="text-muted">Nothing new yet.</span>
              ) : (
                data.changes.slice(0, 8).map((e) => (
                  <span key={e.id}>
                    <span className="font-bold">{e.personName}</span>{" "}
                    <span className="text-muted">{e.action}</span>
                    {e.target ? (
                      <span className="text-muted"> · {e.target}</span>
                    ) : null}
                  </span>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
