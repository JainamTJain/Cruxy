"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MasteryBand, MasteryMapView } from "@/lib/mastery/types";

type CaseOpt = { id: string; number: number; title: string };
type TeamOpt = { id: string; name: string; colour: string };

const BAND_STYLE: Record<MasteryBand, { bg: string; label: string }> = {
  empty: { bg: "#F7F8FA", label: "Not started" },
  low: { bg: "#FDECEC", label: "Low" },
  mid: { bg: "#FFF7DB", label: "Building" },
  high: { bg: "#E6F4F1", label: "Strong" },
};

export default function MasteryMapPage() {
  const [access, setAccess] = useState<
    "admin" | "lead" | "self" | "none" | null
  >(null);
  const [cases, setCases] = useState<CaseOpt[]>([]);
  const [teams, setTeams] = useState<TeamOpt[]>([]);
  const [caseId, setCaseId] = useState<string>("");
  const [teamId, setTeamId] = useState<string>("");
  const [map, setMap] = useState<MasteryMapView | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const loadMeta = useCallback(async () => {
    const res = await fetch("/api/mastery");
    if (!res.ok) {
      setStatus("Could not load the mastery map. Refresh and try again.");
      return;
    }
    const data = (await res.json()) as {
      access: "admin" | "lead" | "self" | "none";
      cases: CaseOpt[];
      teams?: TeamOpt[];
    };
    setAccess(data.access);
    setCases(data.cases);
    setTeams(data.teams ?? []);
    if (!caseId && data.cases[0]) setCaseId(data.cases[0].id);
  }, [caseId]);

  const loadMap = useCallback(async () => {
    if (!caseId) return;
    const q = new URLSearchParams({ caseId });
    if (teamId) q.set("teamId", teamId);
    const res = await fetch(`/api/mastery?${q}`);
    if (!res.ok) {
      setStatus("Could not load this case. Pick another case or refresh.");
      return;
    }
    const data = (await res.json()) as { map: MasteryMapView };
    setMap(data.map);
    setStatus(null);
  }, [caseId, teamId]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void loadMap();
  }, [loadMap]);

  const cellLookup = useMemo(() => {
    const m = new Map<string, MasteryMapView["cells"][number]>();
    for (const c of map?.cells ?? []) {
      m.set(`${c.person_id}:${c.node_id}`, c);
    }
    return m;
  }, [map]);

  if (access === null) {
    return (
      <div className="animate-fade-up p-4 text-sm text-muted">
        Loading your mastery map…
      </div>
    );
  }

  if (access === "none") {
    return (
      <div className="animate-fade-up flex flex-col gap-3">
        <h1 className="font-display m-0 text-[40px] font-extrabold tracking-[-0.02em] max-md:text-[32px]">
          Mastery map
        </h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Shows how well you know each claim on a case, from your own drills and
          rounds. Sign in with a team to see your row. Case leads see the full
          grid; Dr. B and Jainam see every team in admin view.
        </p>
      </div>
    );
  }

  return (
    <div className="animate-fade-up flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted">
            {access === "admin"
              ? "All teams"
              : access === "self"
                ? "Your row"
                : map?.teamName ?? "Your team"}
          </span>
          <h1 className="font-display m-0 text-[40px] font-extrabold leading-none tracking-[-0.02em] max-md:text-[32px]">
            Mastery map
          </h1>
          <p className="m-0 max-w-xl text-sm text-muted">
            How strong each person is on each claim for this case. Colour comes
            from flashcard reviews, drills and rounds. Empty cells mean no
            practice yet. Pick a case to begin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="text-xs font-semibold text-muted">
            Case
            <select
              className="mt-1 block h-10 min-w-[200px] rounded-xl border border-mist bg-white px-3 text-sm text-ink"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
            >
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.number}. {c.title}
                </option>
              ))}
            </select>
          </label>
          {access === "admin" ? (
            <label className="text-xs font-semibold text-muted">
              Team filter
              <select
                className="mt-1 block h-10 min-w-[160px] rounded-xl border border-mist bg-white px-3 text-sm text-ink"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
              >
                <option value="">All teams</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>

      {status ? <p className="text-sm text-muted">{status}</p> : null}

      <div className="flex flex-wrap gap-3 text-xs text-muted">
        {(Object.keys(BAND_STYLE) as MasteryBand[]).map((b) => (
          <span key={b} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-3.5 w-3.5 rounded-sm border border-ink/10"
              style={{ background: BAND_STYLE[b].bg }}
            />
            {BAND_STYLE[b].label}
          </span>
        ))}
      </div>

      {map?.emptyNodes ? (
        <section className="rounded-[20px] bg-white p-5 text-sm text-muted">
          No claim nodes yet for this case. When the team publishes a claim map
          or claims, columns appear here.
        </section>
      ) : null}

      {map && !map.emptyNodes ? (
        <section className="overflow-x-auto rounded-[20px] bg-white">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <caption className="px-5 pb-2 pt-4 text-left font-display text-[22px] font-extrabold">
              Case {map.caseNumber}: {map.caseTitle}
              {map.emptyActivity ? (
                <span className="ml-2 text-sm font-medium text-muted">
                  No activity yet
                </span>
              ) : null}
            </caption>
            <thead>
              <tr className="bg-[#F7F8FA] text-left text-[12px]">
                <th className="sticky left-0 z-[1] bg-[#F7F8FA] px-4 py-2.5 font-semibold">
                  Person
                </th>
                {map.nodes.map((n) => (
                  <th
                    key={n.node_id}
                    className="max-w-[140px] px-2 py-2.5 font-semibold"
                    title={n.label}
                  >
                    <span className="line-clamp-2">{n.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {map.people.map((p) => (
                <tr key={p.id} className="border-t border-[#ECEEF1]">
                  <td className="sticky left-0 z-[1] bg-white px-4 py-2 font-semibold">
                    {p.name}
                    {access === "admin" && p.team_name ? (
                      <span className="mt-0.5 block text-[11px] font-medium text-muted">
                        {p.team_name}
                      </span>
                    ) : null}
                  </td>
                  {map.nodes.map((n) => {
                    const cell = cellLookup.get(`${p.id}:${n.node_id}`);
                    const band = cell?.band ?? "empty";
                    const style = BAND_STYLE[band];
                    const title =
                      cell?.mastery == null
                        ? "Not started"
                        : `${Math.round(cell.mastery * 100)}% mastery`;
                    return (
                      <td key={n.node_id} className="px-2 py-2">
                        <div
                          className="flex h-10 items-center justify-center rounded-lg border border-ink/5 text-[11px] font-semibold"
                          style={{ background: style.bg }}
                          title={title}
                          aria-label={`${p.name}, ${n.label}: ${title}`}
                        >
                          {cell?.mastery == null
                            ? ""
                            : `${Math.round(cell.mastery * 100)}%`}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!map.people.length ? (
                <tr>
                  <td
                    colSpan={map.nodes.length + 1}
                    className="px-4 py-6 text-muted"
                  >
                    No people to show for this view.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
