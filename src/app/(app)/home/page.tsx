"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HomeDiffs } from "@/components/home-diffs";

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
};

type MapData = {
  teams: Team[];
  cases: CaseRow[];
  readiness: Cell[];
  totals: Record<string, number>;
  teamAverages: { team_id: string; avg: number; delta_week: number }[];
  competition: { name: string; date: string; place: string | null } | null;
  daysToCompetition: number | null;
  changes: Change[];
  nextActions: string[];
};

/** Sample week deltas shown on the program map (design Home.html). */
const TOTAL_DELTAS: Record<string, string> = {
  drive_files: "+18 this week",
  ideas_accepted: "+31 this week",
  sources_verified: "+9 overnight",
  bank_questions: "+40 from Dr. B",
  rounds_graded: "avg 41 of 60",
  redo_improvements: "+2.1 points each",
  passages_cited: "cited in maps",
};

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

  if (error) {
    return <p className="text-sm text-cardinal">{error}</p>;
  }
  if (!data) {
    return <p className="text-sm text-muted">Loading program map…</p>;
  }

  const cellFor = (teamId: string, caseId: string) =>
    data.readiness.find((c) => c.team_id === teamId && c.case_id === caseId);

  const totalRows: { key: string; n: string; label: string; delta?: string }[] =
    [
      {
        key: "drive_files",
        n: String(data.totals.drive_files ?? "—"),
        label: "Drive files read",
        delta: TOTAL_DELTAS.drive_files,
      },
      {
        key: "ideas_accepted",
        n: String(data.totals.ideas_accepted ?? "—"),
        label: "ideas accepted",
        delta: TOTAL_DELTAS.ideas_accepted,
      },
      {
        key: "sources_verified",
        n: String(data.totals.sources_verified ?? "—"),
        label: "sources verified",
        delta: TOTAL_DELTAS.sources_verified,
      },
      {
        key: "bank_questions",
        n: String(data.totals.bank_questions ?? "—"),
        label: "bank questions",
        delta: TOTAL_DELTAS.bank_questions,
      },
      {
        key: "rounds_graded",
        n: String(data.totals.rounds_graded ?? "—"),
        label: "rounds graded",
        delta: TOTAL_DELTAS.rounds_graded,
      },
      {
        key: "redo_improvements",
        n: String(data.totals.redo_improvements ?? "—"),
        label: "redos that improved",
        delta: TOTAL_DELTAS.redo_improvements,
      },
      {
        key: "passages_cited",
        n: String(data.totals.passages_cited ?? "—"),
        label: "passages cited",
        delta: TOTAL_DELTAS.passages_cited,
      },
    ];

  return (
    <main className="animate-fade-up space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            Saturday · program map
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink sm:text-4xl">
            Where the program stands
          </h1>
          <p className="mt-1 text-sm text-muted">
            12 cases × 3 teams · readiness, leads, and what changed ·{" "}
            <Link href="/case-brain" className="underline">
              Case brain
            </Link>
          </p>
        </div>
        {data.daysToCompetition != null && data.competition ? (
          <div className="min-w-[9rem] rounded-2xl bg-cardinal px-4 py-3 text-paper shadow-md">
            <p className="font-display text-4xl font-semibold leading-none">
              {data.daysToCompetition}
            </p>
            <p className="mt-1 text-xs text-paper/85">
              days to {data.competition.place ?? data.competition.name}
            </p>
            <p className="font-mono text-[10px] text-paper/70">
              {data.competition.name}, {data.competition.date}
            </p>
          </div>
        ) : null}
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {totalRows.map((row) => (
          <div
            key={row.key}
            className="rounded-2xl border border-ink/10 bg-white/70 px-3 py-4"
          >
            <p className="font-display text-2xl font-semibold tabular-nums">
              {row.n}
            </p>
            <p className="text-xs text-muted">{row.label}</p>
            {row.delta ? (
              <p className="mt-1 text-[11px] font-medium text-cardinal/90">
                {row.delta}
              </p>
            ) : null}
          </div>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {data.teams.map((t) => {
          const a = data.teamAverages.find((x) => x.team_id === t.id);
          const pct = a?.avg ?? 0;
          return (
            <div
              key={t.id}
              className="rounded-2xl border border-ink/10 bg-white/70 px-4 py-4"
            >
              <p
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: t.colour }}
              >
                {t.name} ready
              </p>
              <p className="font-display text-3xl font-semibold tabular-nums">
                {pct}%
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-mist">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    backgroundColor: t.colour,
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-muted">
                +{a?.delta_week ?? 0} this week
              </p>
            </div>
          );
        })}
      </section>

      <HomeDiffs />

      <section>
        <h2 className="font-display text-xl font-semibold">Case board</h2>
        <p className="mt-1 text-sm text-muted">
          Readiness per team · leads · latest
        </p>
        <div className="mt-4 overflow-x-auto rounded-2xl border border-ink/10 bg-white/60">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 bg-ink/[0.03] text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-3">Case</th>
                {data.teams.map((t) => (
                  <th
                    key={t.id}
                    className="px-3 py-3"
                    style={{ color: t.colour }}
                  >
                    {t.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.cases.map((c) => (
                <tr key={c.id} className="border-b border-ink/5 align-top">
                  <td className="px-3 py-3 font-medium">
                    <Link
                      href={`/case-brain/${c.id}`}
                      className="hover:text-cardinal"
                    >
                      <span className="font-mono text-xs text-muted">
                        {String(c.number).padStart(2, "0")}
                      </span>{" "}
                      {c.title}
                    </Link>
                  </td>
                  {data.teams.map((t) => {
                    const cell = cellFor(t.id, c.id);
                    const pct = cell?.readiness_pct ?? 0;
                    return (
                      <td key={t.id} className="px-3 py-3">
                        {cell ? (
                          <div>
                            <div className="flex items-baseline gap-2">
                              <p className="font-mono text-sm font-semibold tabular-nums">
                                {pct}%
                              </p>
                            </div>
                            <div className="mt-1 h-1.5 max-w-[7rem] overflow-hidden rounded-full bg-mist">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(100, pct)}%`,
                                  backgroundColor: t.colour,
                                }}
                              />
                            </div>
                            <p className="mt-1 text-xs text-muted">
                              {cell.lead_names.join(" · ") || "—"}
                            </p>
                            {cell.latest_event ? (
                              <p className="mt-1 text-[11px] text-ink/70">
                                {cell.latest_event}
                              </p>
                            ) : null}
                            <Link
                              href={`/case-brain/${c.id}?team=${t.id}`}
                              className="mt-1 inline-block text-[11px] underline-offset-2 hover:underline"
                              style={{ color: t.colour }}
                            >
                              Open brain
                            </Link>
                          </div>
                        ) : (
                          <Link
                            href={`/case-brain/${c.id}?team=${t.id}`}
                            className="text-xs underline-offset-2 hover:underline"
                            style={{ color: t.colour }}
                          >
                            Open
                          </Link>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-ink/10 bg-white/70 p-4">
          <h2 className="font-display text-lg font-semibold">
            Since your last visit
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.changes.length === 0 ? (
              <li className="text-muted">Nothing new yet — welcome back.</li>
            ) : (
              data.changes.map((e) => (
                <li key={e.id} className="border-b border-ink/5 pb-2">
                  <span className="font-mono text-xs text-muted">
                    {new Date(e.at).toLocaleString()}
                  </span>
                  <br />
                  <span className="font-medium">{e.personName}</span>{" "}
                  <span className="text-muted">{e.action}</span>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="rounded-2xl border border-ink/10 bg-white/70 p-4">
          <h2 className="font-display text-lg font-semibold">Your next three</h2>
          <ol className="mt-3 space-y-3">
            {data.nextActions.slice(0, 3).map((a, i) => (
              <li
                key={a}
                className="flex gap-3 rounded-xl border border-ink/8 bg-paper/80 px-3 py-3 text-sm"
              >
                <span className="font-display text-xl font-semibold text-cardinal">
                  {i + 1}
                </span>
                <span className="pt-0.5">{a}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted">
            Also see{" "}
            <Link href="/revision/roadmap" className="underline">
              My roadmap
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
