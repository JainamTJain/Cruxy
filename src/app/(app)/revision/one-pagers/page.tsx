"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OnePagerDocument } from "@/components/case-brain/one-pager-document";
import type { OnePager } from "@/lib/revision/types";
import type { CaseRow, Team } from "@/lib/types";

type Meta = { cases: CaseRow[]; teams: Team[] };

type BrainLite = {
  case: CaseRow | null;
  people: { id: string; name: string; team_id: string | null }[];
  brain: {
    case_roles: { role: string; person_id: string }[];
    team_id: string;
  };
  viewer: { personId: string; teamId: string };
};

function OnePagersInner() {
  const search = useSearchParams();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [teamId, setTeamId] = useState(search.get("teamId") ?? "");
  const [caseId, setCaseId] = useState(search.get("caseId") ?? "");
  const [page, setPage] = useState<OnePager | null>(null);
  const [diff, setDiff] = useState<
    { path: string; before: string; after: string }[]
  >([]);
  const [brain, setBrain] = useState<BrainLite | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/revision/one-pagers");
      const data = (await res.json()) as Meta;
      setMeta(data);
      if (!teamId && data.teams.find((t) => t.name === "Team 3")) {
        setTeamId(data.teams.find((t) => t.name === "Team 3")!.id);
      } else if (!teamId && data.teams[0]) {
        setTeamId(data.teams[0].id);
      }
      // Prefer Case 9 (GEM) when no case chosen — matches the reference
      if (!caseId) {
        const gem = data.cases.find((c) => c.number === 9);
        setCaseId(gem?.id ?? data.cases[0]?.id ?? "");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPager() {
    if (!teamId || !caseId) return;
    const res = await fetch(
      `/api/revision/one-pagers?teamId=${teamId}&caseId=${caseId}`,
    );
    const data = (await res.json()) as {
      onePager: OnePager | null;
      diff: { path: string; before: string; after: string }[];
    };
    setPage(data.onePager);
    setDiff(data.diff ?? []);
  }

  async function loadBrain() {
    if (!caseId || !teamId) return;
    const res = await fetch(
      `/api/case-brain/${caseId}?teamId=${encodeURIComponent(teamId)}`,
    );
    if (!res.ok) return;
    const data = (await res.json()) as BrainLite;
    setBrain(data);
  }

  useEffect(() => {
    if (teamId && caseId) {
      void loadPager();
      void loadBrain();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, caseId]);

  const roles = useMemo(() => {
    const people = brain?.people ?? [];
    const name = (role: string) => {
      const id = brain?.brain.case_roles.find((r) => r.role === role)?.person_id;
      return people.find((p) => p.id === id)?.name ?? "Not set";
    };
    return {
      lead1: name("lead_1"),
      lead2: name("lead_2"),
      counter: name("counter_arguer"),
      supporter: name("supporter"),
    };
  }, [brain]);

  const team = meta?.teams.find((t) => t.id === teamId) ?? null;
  const caseRow =
    meta?.cases.find((c) => c.id === caseId) ?? brain?.case ?? null;
  const teamSize =
    brain?.people.filter((p) => p.team_id === teamId).length ?? 4;
  const canSign = Boolean(
    page && brain && brain.viewer.teamId === page.team_id,
  );

  async function draft() {
    if (!teamId || !caseId) return;
    setBusy(true);
    setStatus("Drafting…");
    try {
      const res = await fetch("/api/revision/one-pagers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "draft", teamId, caseId }),
      });
      const data = (await res.json()) as { onePager: OnePager; error?: string };
      if (!res.ok) {
        setStatus(data.error ?? "Draft failed");
        return;
      }
      setPage(data.onePager);
      setStatus(`Drafted v${data.onePager.version}`);
    } finally {
      setBusy(false);
    }
  }

  async function signOff() {
    if (!page) return;
    setBusy(true);
    try {
      await fetch("/api/revision/one-pagers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "signoff", onePagerId: page.id }),
      });
      setStatus(`Signed off v${page.version}`);
      await loadPager();
    } finally {
      setBusy(false);
    }
  }

  async function exportDrive() {
    if (!page) return;
    setBusy(true);
    try {
      const res = await fetch("/api/revision/one-pagers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "export", onePagerId: page.id }),
      });
      const data = (await res.json()) as {
        drive_doc_id: string;
        stub: boolean;
      };
      setStatus(
        data.stub
          ? "Drive export prepared locally. Connect Drive to send the file."
          : "Saved to the team's Drive folder.",
      );
    } finally {
      setBusy(false);
    }
  }

  function exportPdf() {
    window.print();
  }

  return (
    <div className="-mx-2 space-y-4 md:-mx-4">
      <div className="flex flex-wrap gap-3 print:hidden">
        <select
          className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm"
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
        >
          {meta?.teams.map((t) => (
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
          {meta?.cases.map((c) => (
            <option key={c.id} value={c.id}>
              {String(c.number).padStart(2, "0")} {c.title}
            </option>
          ))}
        </select>
      </div>

      {page ? (
        <>
          <OnePagerDocument
            page={page}
            caseRow={caseRow}
            team={team}
            roles={roles}
            teamSize={teamSize}
            canSign={canSign}
            busy={busy}
            status={status}
            onSignOff={() => void signOff()}
            onExportPdf={exportPdf}
            onExportDrive={() => void exportDrive()}
            onRedraft={() => void draft()}
          />
          {diff.length ? (
            <section className="mx-auto w-full max-w-[1100px] rounded-[20px] bg-white p-5 print:hidden">
              <h2 className="font-display text-xl font-extrabold">
                Diff since last version
              </h2>
              <ul className="mt-3 space-y-2 text-sm">
                {diff.map((d) => (
                  <li key={d.path} className="rounded-xl bg-[#F7F8FA] px-3 py-2">
                    <span className="font-mono text-xs text-muted">{d.path}</span>
                    <div>
                      <span className="text-muted line-through">
                        {d.before || "∅"}
                      </span>
                      {" → "}
                      <span className="text-cardinal">{d.after || "∅"}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : (
        <div className="rounded-[20px] bg-white p-8">
          <h2 className="font-display m-0 text-2xl font-extrabold">
            No one pager yet
          </h2>
          <p className="mt-2 max-w-md text-sm leading-snug text-muted">
            Cruxy can draft one from this team&apos;s claim map. You edit it,
            then everyone signs it off before the round.
          </p>
          <button
            type="button"
            disabled={busy || !teamId || !caseId}
            onClick={() => void draft()}
            className="mt-4 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            Ask Cruxy to draft
          </button>
          {status ? <p className="mt-2 text-xs text-muted">{status}</p> : null}
        </div>
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
