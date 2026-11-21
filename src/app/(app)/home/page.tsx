"use client";

import { useEffect, useState } from "react";

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

  const totalRows: [string, string][] = [
    [String(data.totals.drive_files ?? "—"), "Drive files"],
    [String(data.totals.passages_cited ?? "—"), "passages cited"],
    [String(data.totals.ideas_accepted ?? "—"), "ideas accepted"],
    [String(data.totals.sources_verified ?? "—"), "sources verified"],
    [String(data.totals.bank_questions ?? "—"), "bank questions"],
    [String(data.totals.rounds_graded ?? "—"), "rounds graded"],
    [String(data.totals.redo_improvements ?? "—"), "redos improved"],
  ];

  return (
    <main className="animate-fade-up space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">
            Where the program stands
          </h1>
          <p className="mt-1 text-sm text-muted">
            12 cases × 3 teams · readiness, leads, and what changed
          </p>
        </div>
        {data.daysToCompetition != null && data.competition ? (
          <p className="rounded-xl bg-gold/20 px-3 py-2 font-mono text-sm text-ink">
            {data.daysToCompetition} days to {data.competition.name}
            {data.competition.place ? `, ${data.competition.place}` : ""} ·{" "}
            {data.competition.date}
          </p>
        ) : null}
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        {totalRows.map(([n, label]) => (
          <div
            key={label}
            className="rounded-2xl border border-ink/10 bg-white/60 px-3 py-4"
          >
            <p className="font-display text-2xl font-semibold">{n}</p>
            <p className="text-xs text-muted">{label}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {data.teams.map((t) => {
          const a = data.teamAverages.find((x) => x.team_id === t.id);
          return (
            <div
              key={t.id}
              className="rounded-2xl border border-ink/10 bg-white/60 px-4 py-3"
            >
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: t.colour }}>
                {t.name} ready
              </p>
              <p className="font-display text-3xl font-semibold">{a?.avg ?? 0}%</p>
              <p className="text-xs text-muted">+{a?.delta_week ?? 0} this week</p>
            </div>
          );
        })}
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold">Case board</h2>
        <p className="mt-1 text-sm text-muted">
          Each cell: readiness, leads, latest event.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3">Case</th>
                {data.teams.map((t) => (
                  <th key={t.id} className="py-2 pr-3" style={{ color: t.colour }}>
                    {t.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.cases.map((c) => (
                <tr key={c.id} className="border-b border-ink/5 align-top">
                  <td className="py-3 pr-3 font-medium">
                    <span className="font-mono text-xs text-muted">
                      {String(c.number).padStart(2, "0")}
                    </span>{" "}
                    {c.title}
                  </td>
                  {data.teams.map((t) => {
                    const cell = cellFor(t.id, c.id);
                    return (
                      <td key={t.id} className="py-3 pr-3">
                        {cell ? (
                          <div>
                            <p className="font-mono text-sm font-semibold">
                              {cell.readiness_pct}%
                            </p>
                            <p className="text-xs text-muted">
                              {cell.lead_names.join(" · ")}
                            </p>
                            {cell.latest_event ? (
                              <p className="mt-1 text-[11px] text-ink/70">
                                {cell.latest_event}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
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
        <div className="rounded-2xl border border-ink/10 bg-white/60 p-4">
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
        <div className="rounded-2xl border border-ink/10 bg-white/60 p-4">
          <h2 className="font-display text-lg font-semibold">Your next three</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
            {data.nextActions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
