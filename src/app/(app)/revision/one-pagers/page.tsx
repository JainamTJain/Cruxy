"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OnePagerPanel } from "@/components/case/one-pager-panel";
import { PageIntro } from "@/components/page-intro";
import type { CaseRow, Team } from "@/lib/types";

function OnePagersInner() {
  const search = useSearchParams();
  const [teams, setTeams] = useState<Team[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [teamId, setTeamId] = useState(search.get("teamId") ?? "");
  const [caseId, setCaseId] = useState(search.get("caseId") ?? "");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/revision/one-pagers");
      const data = (await res.json()) as { cases: CaseRow[]; teams: Team[] };
      setTeams(data.teams);
      setCases(data.cases);
      if (!teamId) {
        const t3 = data.teams.find((t) => t.name === "Team 3");
        setTeamId(t3?.id ?? data.teams[0]?.id ?? "");
      }
      if (!caseId) {
        const gem = data.cases.find((c) => c.number === 9);
        setCaseId(gem?.id ?? data.cases[0]?.id ?? "");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="-mx-2 space-y-4 md:-mx-4">
      <PageIntro title="One pager">
        Each team edits its own sheet. Tap a line to change it. Saving makes a
        new version.
      </PageIntro>

      <div className="flex flex-wrap gap-3 print:hidden">
        <select
          className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
          value={caseId}
          onChange={(e) => setCaseId(e.target.value)}
        >
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {String(c.number).padStart(2, "0")} {c.title}
            </option>
          ))}
        </select>
      </div>

      {teamId && caseId ? (
        <OnePagerPanel caseId={caseId} teamId={teamId} />
      ) : (
        <p className="text-sm text-muted">Pick a team and case.</p>
      )}
    </div>
  );
}

export default function OnePagersPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-muted">Loading one pager…</p>}
    >
      <OnePagersInner />
    </Suspense>
  );
}
