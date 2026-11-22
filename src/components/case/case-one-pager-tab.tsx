"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { OnePagerDocument } from "@/components/case-brain/one-pager-document";
import { Skeleton, SkeletonBlock } from "@/components/motion/skeleton";
import type { OnePager } from "@/lib/revision/types";
import type { CaseRow, Team } from "@/lib/types";
import { cn } from "@/lib/utils";

type BrainLite = {
  case: CaseRow | null;
  people: { id: string; name: string; team_id: string | null }[];
  brain: {
    case_roles: { role: string; person_id: string }[];
    team_id: string;
  };
  viewer: { personId: string; teamId: string };
  teams: Team[];
};

/**
 * One pager for this team and case, embedded in the case page.
 * G will make it editable; this tab already hosts the document.
 */
export function CaseOnePagerTab({
  caseId,
  teamId,
  className,
}: {
  caseId: string;
  teamId: string;
  className?: string;
}) {
  const [page, setPage] = useState<OnePager | null>(null);
  const [brain, setBrain] = useState<BrainLite | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pagerRes, brainRes] = await Promise.all([
        fetch(
          `/api/revision/one-pagers?teamId=${encodeURIComponent(teamId)}&caseId=${encodeURIComponent(caseId)}`,
        ),
        fetch(
          `/api/case-brain/${caseId}?teamId=${encodeURIComponent(teamId)}`,
        ),
      ]);
      if (!pagerRes.ok) {
        setError("Could not load the one pager.");
        return;
      }
      const pagerJson = (await pagerRes.json()) as {
        onePager: OnePager | null;
      };
      setPage(pagerJson.onePager);
      if (brainRes.ok) {
        setBrain((await brainRes.json()) as BrainLite);
      }
    } finally {
      setLoading(false);
    }
  }, [caseId, teamId]);

  useEffect(() => {
    void load();
  }, [load]);

  const roles = useMemo(() => {
    const people = brain?.people ?? [];
    const name = (role: string) => {
      const id = brain?.brain.case_roles.find((r) => r.role === role)?.person_id;
      return people.find((p) => p.id === id)?.name ?? "";
    };
    return {
      lead1: name("lead_1") || "—",
      lead2: name("lead_2") || "—",
      counter: name("counter_arguer") || "—",
      supporter: name("supporter") || "—",
    };
  }, [brain]);

  const team =
    brain?.teams.find((t) => t.id === teamId) ??
    brain?.teams.find((t) => t.id === brain.brain.team_id) ??
    null;
  const teamSize =
    brain?.people.filter((p) => p.team_id === teamId).length ?? 4;
  const canSign = Boolean(
    page && brain && brain.viewer.teamId === page.team_id,
  );

  async function draft() {
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
      await load();
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
      const data = (await res.json()) as { stub?: boolean };
      setStatus(
        data.stub
          ? "Drive export prepared locally. Connect Drive to send the file."
          : "Saved to the team's Drive folder.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className={cn("flex flex-col gap-3", className)} aria-busy>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" rounded="lg" />
        <SkeletonBlock lines={4} />
      </div>
    );
  }

  if (error) {
    return <p className={cn("text-sm text-cardinal", className)}>{error}</p>;
  }

  if (!page) {
    return (
      <section className={cn("rounded-[20px] bg-white p-5", className)}>
        <h2 className="font-display m-0 text-xl font-extrabold">One pager</h2>
        <p className="mt-2 text-sm text-muted">
          No one pager for this team and case yet.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void draft()}
          className="mt-3 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          Draft one pager
        </button>
        {status ? (
          <p className="mt-2 text-sm text-muted" role="status">
            {status}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <div className={cn("-mx-1", className)}>
      <OnePagerDocument
        page={page}
        caseRow={brain?.case ?? null}
        team={team}
        roles={roles}
        teamSize={teamSize}
        canSign={canSign}
        busy={busy}
        status={status}
        onSignOff={() => void signOff()}
        onExportPdf={() => window.print()}
        onExportDrive={() => void exportDrive()}
        onRedraft={() => void draft()}
      />
    </div>
  );
}
