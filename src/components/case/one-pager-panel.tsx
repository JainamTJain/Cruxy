"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  OnePagerEditableField,
  RoleNameSkeleton,
} from "@/components/case/one-pager-editable-field";
import { SaveShareMenu } from "@/components/case/save-share-menu";
import {
  ensureCounterclaim,
  ensureLanguage,
  patchValuesVisual,
  readValues,
  syncThesisVisual,
  withEmptyRows,
} from "@/lib/revision/one-pager-edit";
import type { OnePager, OnePagerBody } from "@/lib/revision/types";
import type { CaseRow, Team } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { FieldFlag } from "@/components/case/one-pager-editable-field";

type RoleNames = {
  lead1: string | null;
  lead2: string | null;
  counter: string | null;
  supporter: string | null;
};

type VersionRow = OnePager & { editorName?: string };

type LineFlag = FieldFlag & { fieldKey: string };

type Props = {
  caseId: string;
  teamId: string;
  /** Hide the standalone page chrome when embedded in the case tab. */
  embedded?: boolean;
  className?: string;
};

/**
 * Team one-pager: always drawn from the working document (or truth source).
 * In-place edit writes back to that document. Printable on one page.
 */
export function OnePagerPanel({ caseId, teamId, embedded, className }: Props) {
  const [page, setPage] = useState<OnePager | null>(null);
  const [diff, setDiff] = useState<
    { path: string; before: string; after: string }[]
  >([]);
  const [canEdit, setCanEdit] = useState(false);
  const [caseRow, setCaseRow] = useState<CaseRow | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [roles, setRoles] = useState<RoleNames | null>(null);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [teamSize, setTeamSize] = useState(0);
  const [viewerName, setViewerName] = useState("you");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [changeNote, setChangeNote] = useState("");
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [peopleMap, setPeopleMap] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [flags, setFlags] = useState<LineFlag[]>([]);
  const [syncProposal, setSyncProposal] = useState<{
    id: string;
    changeSummary: string;
    createdAt: string;
  } | null>(null);

  const flagFor = useCallback(
    (fieldKey: string): FieldFlag | null => {
      const hit = flags.find((f) => f.fieldKey === fieldKey);
      return hit
        ? { label: hit.label, detail: hit.detail, kind: hit.kind }
        : null;
    },
    [flags],
  );

  const loadPager = useCallback(async () => {
    if (!teamId || !caseId) return;
    setLoading(true);
    const res = await fetch(
      `/api/revision/one-pagers?teamId=${encodeURIComponent(teamId)}&caseId=${encodeURIComponent(caseId)}`,
    );
    if (!res.ok) {
      setError("Could not load the one pager.");
      setLoading(false);
      return;
    }
    const data = (await res.json()) as {
      onePager: OnePager | null;
      diff: { path: string; before: string; after: string }[];
      canEdit?: boolean;
      flags?: LineFlag[];
      syncProposal?: {
        id: string;
        changeSummary: string;
        createdAt: string;
      } | null;
    };
    setPage(data.onePager);
    setDiff(data.diff ?? []);
    setCanEdit(Boolean(data.canEdit));
    setFlags(data.flags ?? []);
    setSyncProposal(data.syncProposal ?? null);
    setError(null);
    setLoading(false);
  }, [teamId, caseId]);

  const loadMeta = useCallback(async () => {
    const brainQ = embedded ? "&lite=1" : "";
    const [metaRes, brainRes, meRes] = await Promise.all([
      fetch("/api/revision/one-pagers"),
      fetch(
        `/api/case-brain/${caseId}?teamId=${encodeURIComponent(teamId)}${brainQ}`,
      ),
      fetch("/api/auth/me"),
    ]);
    const meta = (await metaRes.json()) as {
      cases: CaseRow[];
      teams: Team[];
      people?: { id: string; name: string }[];
    };
    setCaseRow(meta.cases.find((c) => c.id === caseId) ?? null);
    setTeam(meta.teams.find((t) => t.id === teamId) ?? null);
    const map: Record<string, string> = {};
    for (const p of meta.people ?? []) map[p.id] = p.name;
    setPeopleMap(map);

    const me = (await meRes.json()) as {
      session?: { name?: string };
      person?: { name?: string };
    };
    const name = me.session?.name ?? me.person?.name ?? "you";
    setViewerName(name.split(" ")[0] ?? "you");

    setRolesLoading(true);
    if (brainRes.ok) {
      const brain = (await brainRes.json()) as {
        people: { id: string; name: string; team_id: string | null }[];
        brain: { case_roles: { role: string; person_id: string }[] };
      };
      for (const p of brain.people) map[p.id] = p.name;
      setPeopleMap({ ...map });
      const nameOf = (role: string) => {
        const id = brain.brain.case_roles.find((r) => r.role === role)?.person_id;
        return id ? (map[id] ?? null) : null;
      };
      setRoles({
        lead1: nameOf("lead_1"),
        lead2: nameOf("lead_2"),
        counter: nameOf("counter_arguer"),
        supporter: nameOf("supporter"),
      });
      setTeamSize(brain.people.filter((p) => p.team_id === teamId).length);
    } else {
      setRoles({
        lead1: null,
        lead2: null,
        counter: null,
        supporter: null,
      });
    }
    setRolesLoading(false);
  }, [caseId, teamId]);

  useEffect(() => {
    void loadPager();
    void loadMeta();
  }, [loadPager, loadMeta]);

  async function saveBody(
    nextBody: OnePagerBody,
    note?: string,
    fieldKey?: string,
  ) {
    if (!page) return;
    setBusy(true);
    setStatus("Saving…");
    try {
      const res = await fetch("/api/revision/one-pagers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save",
          onePagerId: page.id,
          teamId,
          caseId,
          body: withEmptyRows(nextBody),
          changeNote: (note ?? changeNote).trim() || undefined,
          fieldKey,
        }),
      });
      const data = (await res.json()) as {
        onePager?: OnePager;
        flags?: LineFlag[];
        error?: string;
      };
      if (!res.ok) {
        setStatus(data.error ?? "Could not save");
        return;
      }
      setPage(data.onePager!);
      if (data.flags) setFlags(data.flags);
      setChangeNote("");
      setStatus(`Saved v${data.onePager!.version}`);
      if (!data.onePager!.id.startsWith("derived:")) {
        const diffRes = await fetch(
          `/api/revision/one-pagers?id=${encodeURIComponent(data.onePager!.id)}`,
        );
        if (diffRes.ok) {
          const d = (await diffRes.json()) as {
            diff: { path: string; before: string; after: string }[];
          };
          setDiff(d.diff ?? []);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  function printOnePager() {
    document.body.classList.add("printing-one-pager");
    window.print();
    window.setTimeout(() => {
      document.body.classList.remove("printing-one-pager");
    }, 500);
  }

  async function draft() {
    setBusy(true);
    setStatus("Drafting…");
    try {
      const res = await fetch("/api/revision/one-pagers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "draft", teamId, caseId }),
      });
      const data = (await res.json()) as { onePager?: OnePager; error?: string };
      if (!res.ok) {
        setStatus(data.error ?? "Draft failed");
        return;
      }
      setPage(data.onePager!);
      setStatus(`Drafted v${data.onePager!.version}`);
      setCanEdit(true);
    } finally {
      setBusy(false);
    }
  }

  async function signOff() {
    if (!page) return;
    setBusy(true);
    try {
      const res = await fetch("/api/revision/one-pagers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "signoff", onePagerId: page.id }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setStatus(data.error ?? "Could not sign off");
        return;
      }
      setStatus(`Signed off v${page.version}`);
      await loadPager();
    } finally {
      setBusy(false);
    }
  }

  async function loadVersions() {
    const res = await fetch(
      `/api/revision/one-pagers?teamId=${encodeURIComponent(teamId)}&caseId=${encodeURIComponent(caseId)}&versions=1`,
    );
    if (!res.ok) return;
    const data = (await res.json()) as { versions: OnePager[] };
    setVersions(
      data.versions.map((v) => ({
        ...v,
        editorName: v.created_by
          ? peopleMap[v.created_by] ?? "Someone"
          : "Cruxy",
      })),
    );
  }

  async function restore(versionId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/revision/one-pagers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "restore", onePagerId: versionId }),
      });
      const data = (await res.json()) as { onePager?: OnePager; error?: string };
      if (!res.ok) {
        setStatus(data.error ?? "Could not restore");
        return;
      }
      setPage(data.onePager!);
      setStatus(`Restored as v${data.onePager!.version}`);
      await loadVersions();
    } finally {
      setBusy(false);
    }
  }

  const thesis = useMemo(() => {
    if (!page) return "";
    const claimMap = page.body.visuals.find((v) => v.kind === "claim_map");
    const payload = (claimMap?.payload ?? {}) as { thesis?: string };
    return (
      payload.thesis ||
      page.body.language?.plain ||
      page.body.claims[0]?.text ||
      ""
    );
  }, [page]);

  const values = page ? readValues(page.body.visuals) : null;
  const emptyRows = page?.body.empty_rows ?? [];
  const signed = page?.signed_off_by.length ?? 0;

  function roleLabel(name: string | null) {
    if (rolesLoading) return <RoleNameSkeleton />;
    if (!name) return <span className="text-muted">unassigned</span>;
    return <>{name}</>;
  }

  if (error) {
    return <p className="text-sm text-cardinal">{error}</p>;
  }

  if (loading || !page) {
    return (
      <div className={cn("rounded-[20px] bg-white p-6", className)}>
        <p className="m-0 text-sm text-muted">
          Building the one pager from this team&apos;s working document…
        </p>
      </div>
    );
  }

  async function acceptSync() {
    if (!syncProposal) return;
    setBusy(true);
    try {
      const res = await fetch("/api/revision/one-pagers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "accept_sync",
          teamId,
          caseId,
          proposalId: syncProposal.id,
        }),
      });
      const data = (await res.json()) as { onePager?: OnePager; error?: string };
      if (!res.ok) {
        setStatus(data.error ?? "Could not accept update");
        return;
      }
      setPage(data.onePager!);
      setSyncProposal(null);
      setStatus("Accepted working-document update");
    } finally {
      setBusy(false);
    }
  }

  async function dismissSync() {
    if (!syncProposal) return;
    setBusy(true);
    try {
      const res = await fetch("/api/revision/one-pagers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "dismiss_sync",
          teamId,
          caseId,
          proposalId: syncProposal.id,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setStatus(data.error ?? "Could not dismiss");
        return;
      }
      setSyncProposal(null);
      setStatus("Dismissed working-document update");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {syncProposal && canEdit ? (
        <div className="rounded-[16px] border border-[#F5B700]/60 bg-[#FFF8E6] px-4 py-3 print:hidden">
          <p className="m-0 text-sm font-semibold text-ink">
            Working document update ready
          </p>
          <p className="m-0 mt-1 text-[13px] text-[#3B404A]">
            {syncProposal.changeSummary}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              className="rounded-xl bg-ink px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
              onClick={() => void acceptSync()}
            >
              Accept update
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-xl border border-mist bg-white px-3.5 py-2 text-[13px] font-semibold disabled:opacity-60"
              onClick={() => void dismissSync()}
            >
              Keep current
            </button>
          </div>
        </div>
      ) : null}
      <div className="one-pager-toolbar flex flex-wrap items-center justify-between gap-2 print:hidden">
        {!embedded ? (
          <Link
            href={`/case-brain/${caseId}?teamId=${teamId}`}
            className="inline-flex min-h-11 items-center text-sm font-semibold"
          >
            Back to the case
          </Link>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="min-h-11 rounded-[10px] border border-[#C9CCD3] bg-white px-3.5 text-[13px] font-semibold"
            onClick={printOnePager}
          >
            Download PDF or Print
          </button>
          {!embedded ? (
            <SaveShareMenu
              caseId={caseId}
              teamId={teamId}
              onePagerId={page.id.startsWith("derived:") ? undefined : page.id}
              canSaveDrive={canEdit && !page.id.startsWith("derived:")}
              onDriveSaved={(msg) => setStatus(msg)}
            />
          ) : null}
          {canEdit ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void draft()}
                className="min-h-11 rounded-[10px] border border-[#C9CCD3] bg-white px-3.5 text-[13px] font-semibold disabled:opacity-50"
              >
                Ask Cruxy to refresh
              </button>
              {!page.id.startsWith("derived:") ? (
                <button
                  type="button"
                  disabled={busy || emptyRows.length > 0}
                  onClick={() => void signOff()}
                  className="min-h-11 rounded-[10px] bg-ink px-3.5 text-[13px] font-semibold text-white disabled:opacity-50"
                >
                  Sign off v{page.version}
                </button>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            className="min-h-11 rounded-[10px] border border-[#C9CCD3] bg-white px-3.5 text-[13px] font-semibold"
            onClick={() => {
              setVersionsOpen((v) => !v);
              if (!versionsOpen) void loadVersions();
            }}
          >
            Versions
          </button>
        </div>
      </div>

      {!canEdit ? (
        <p className="rounded-[14px] border border-ink/10 bg-[#F7F8FA] px-4 py-3 text-sm print:hidden">
          Read only. Switch to this team, or open admin view as Dr. B or Jainam,
          to edit.
        </p>
      ) : (
        <label className="flex flex-col gap-1 text-xs text-muted print:hidden">
          Change note (optional)
          <input
            className="min-h-11 rounded-xl border border-ink/15 bg-white px-3 text-sm text-ink"
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            placeholder={`Edited by ${viewerName}`}
          />
        </label>
      )}

      {status ? (
        <p className="text-xs text-muted print:hidden">{status}</p>
      ) : null}

      {versionsOpen ? (
        <section className="rounded-[20px] bg-white p-4 print:hidden">
          <h2 className="font-display m-0 text-lg font-extrabold">
            Version history
          </h2>
          <ul className="mt-3 flex list-none flex-col gap-2 p-0">
            {versions.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-[#F7F8FA] px-3 py-2 text-sm"
              >
                <div>
                  <strong>v{v.version}</strong>
                  {", "}
                  {v.editorName}
                  <span className="mt-0.5 block text-xs text-muted">
                    {v.change_note ?? "No note"}
                    {", "}
                    {new Date(v.created_at).toLocaleString()}
                  </span>
                </div>
                {canEdit && v.id !== page.id ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="min-h-11 rounded-lg bg-ink px-3 text-xs font-semibold text-white disabled:opacity-50"
                    onClick={() => void restore(v.id)}
                  >
                    Restore
                  </button>
                ) : (
                  <span className="text-xs text-muted">Current</span>
                )}
              </li>
            ))}
            {versions.length === 0 ? (
              <li className="text-sm text-muted">No versions yet.</li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <article
        id="one-pager-sheet"
        className="one-pager-sheet flex w-full flex-col gap-4 rounded-md bg-white px-5 py-6 sm:gap-5 sm:px-8 sm:py-8"
      >
        <header className="flex flex-wrap items-end justify-between gap-3 border-b-[3px] border-ink pb-3">
          <div className="flex items-end gap-3 sm:gap-4">
            <span className="font-display text-[48px] font-extrabold leading-[0.8] text-cardinal sm:text-[64px]">
              {String(caseRow?.number ?? "").padStart(2, "0")}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                <span>One pager</span>
                <span className="rounded-md bg-[#F7F8FA] px-2 py-0.5 font-semibold normal-case tracking-normal text-[#3B404A]">
                  {team?.name ?? "Team"}
                </span>
                {page.version > 0 ? (
                  <span className="rounded-md bg-ink px-2 py-0.5 font-semibold normal-case tracking-normal text-white">
                    v{page.version}
                  </span>
                ) : null}
                {!canEdit ? (
                  <span className="rounded-md bg-[#FFF3C4] px-2 py-0.5 font-semibold normal-case tracking-normal text-[#8A6500]">
                    Read only
                  </span>
                ) : null}
              </div>
              <h1 className="font-display m-0 text-[24px] font-extrabold leading-tight sm:text-[32px]">
                {caseRow?.title ?? "Case"}
              </h1>
            </div>
          </div>
          <span className="flex max-w-[340px] flex-col items-end gap-0.5 text-right text-[12px] text-muted sm:text-[13px]">
            <span>
              Leads {roleLabel(roles?.lead1 ?? null)}
              {", "}
              {roleLabel(roles?.lead2 ?? null)}
            </span>
            <span>
              counter {roleLabel(roles?.counter ?? null)}
              {", "}
              supporter {roleLabel(roles?.supporter ?? null)}
            </span>
            <span>
              signed off {signed} of {teamSize || "?"}
            </span>
          </span>
        </header>

        <section className="rounded-xl bg-ink px-4 py-3.5 text-white sm:px-5 sm:py-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gold">
            Our answer in one sentence
          </div>
          <div className="font-display mt-1.5 text-[18px] font-semibold leading-snug sm:text-[22px]">
            <OnePagerEditableField
              value={thesis}
              canEdit={canEdit}
              caseId={caseId}
              multiline
              label="one-sentence answer"
              placeholder="Tap to write the answer"
              displayClassName="text-white"
              flag={flagFor("thesis")}
              discussion={{ caseId, teamId, fieldKey: "thesis" }}
              onSave={async (next) => {
                const language = { ...ensureLanguage(page.body), plain: next };
                const visuals = syncThesisVisual(page.body.visuals, next);
                await saveBody({ ...page.body, language, visuals }, undefined, "thesis");
              }}
            />
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {page.body.claims.slice(0, 2).map((c, i) => (
            <div
              key={`claim-${i}`}
              className="flex flex-col gap-2 rounded-xl border-2 border-ink bg-[#FFF7DB] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8A6500]">
                  Claim {i + 1}
                </span>
                {canEdit && page.body.claims.length > 1 ? (
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center text-xs font-semibold text-cardinal underline print:hidden"
                    onClick={() => {
                      const claims = page.body.claims.filter((_, j) => j !== i);
                      void saveBody({ ...page.body, claims }, undefined, `claim_${i}_text`);
                    }}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <OnePagerEditableField
                value={c.text}
                canEdit={canEdit}
                caseId={caseId}
                multiline
                label={`claim ${i + 1}`}
                displayClassName="text-[15px] font-semibold"
                flag={flagFor(`claim_${i}_text`)}
                discussion={{
                  caseId,
                  teamId,
                  fieldKey: `claim_${i}_text`,
                }}
                onSave={async (next) => {
                  const claims = page.body.claims.map((row, j) =>
                    j === i ? { ...row, text: next } : row,
                  );
                  await saveBody({ ...page.body, claims }, undefined, `claim_${i}_text`);
                }}
              />
              <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
                Logic line
              </div>
              <OnePagerEditableField
                value={c.logic_line}
                canEdit={canEdit}
                caseId={caseId}
                multiline
                label={`logic ${i + 1}`}
                displayClassName="text-[13px] leading-snug"
                flag={flagFor(`claim_${i}_logic`)}
                discussion={{
                  caseId,
                  teamId,
                  fieldKey: `claim_${i}_logic`,
                }}
                onSave={async (next) => {
                  const claims = page.body.claims.map((row, j) =>
                    j === i ? { ...row, logic_line: next } : row,
                  );
                  await saveBody({ ...page.body, claims }, undefined, `claim_${i}_logic`);
                }}
              />
              <div className="mt-1 grid gap-2 sm:grid-cols-3">
                {c.supports.slice(0, 3).map((s, j) => (
                  <div
                    key={`s-${i}-${j}`}
                    className="rounded-[10px] border border-ink/20 bg-white p-2.5"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <strong className="text-xs">S{j + 1}</strong>
                      {canEdit && c.supports.filter(Boolean).length > 1 ? (
                        <button
                          type="button"
                          className="inline-flex min-h-11 items-center text-[11px] text-cardinal underline print:hidden"
                          onClick={() => {
                            const claims = page.body.claims.map((row, ci) => {
                              if (ci !== i) return row;
                              return {
                                ...row,
                                supports: row.supports.filter(
                                  (_, sj) => sj !== j,
                                ),
                              };
                            });
                            void saveBody(
                              { ...page.body, claims },
                              undefined,
                              `claim_${i}_support_${j}`,
                            );
                          }}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <OnePagerEditableField
                      value={s}
                      canEdit={canEdit}
                      caseId={caseId}
                      multiline
                      label={`support ${i + 1}-${j + 1}`}
                      displayClassName="text-[12px] leading-snug"
                      flag={flagFor(`claim_${i}_support_${j}`)}
                      onSave={async (next) => {
                        const claims = page.body.claims.map((row, ci) => {
                          if (ci !== i) return row;
                          const supports = row.supports.map((sup, sj) =>
                            sj === j ? next : sup,
                          );
                          return { ...row, supports };
                        });
                        await saveBody(
                          { ...page.body, claims },
                          undefined,
                          `claim_${i}_support_${j}`,
                        );
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-2 rounded-xl border-2 border-cardinal p-3.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-cardinal">
            Strongest objection and our reply
          </span>
          <OnePagerEditableField
            value={page.body.counterclaim?.text ?? ""}
            canEdit={canEdit}
            caseId={caseId}
            multiline
            label="counterclaim"
            displayClassName="text-[15px] font-semibold"
            placeholder="Tap to add the counterclaim"
            flag={flagFor("counterclaim_text")}
            onSave={async (next) => {
              const counterclaim = {
                ...ensureCounterclaim(page.body),
                text: next,
              };
              await saveBody(
                { ...page.body, counterclaim },
                undefined,
                "counterclaim_text",
              );
            }}
          />
          <div className="grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-3">
            {(
              [
                ["concede", "Concede", "counterclaim_concede"],
                ["distinguish", "Distinguish", "counterclaim_distinguish"],
                ["rebut", "Rebut", "counterclaim_rebut"],
              ] as const
            ).map(([key, label, fieldKey]) => (
              <div key={key} className="rounded-xl bg-[#F7F8FA] p-3">
                <strong>{label}</strong>
                <div className="mt-1">
                  <OnePagerEditableField
                    value={page.body.counterclaim?.[key] ?? ""}
                    canEdit={canEdit}
                    caseId={caseId}
                    multiline
                    label={label}
                    placeholder="Tap to add"
                    flag={flagFor(fieldKey)}
                    onSave={async (next) => {
                      const counterclaim = {
                        ...ensureCounterclaim(page.body),
                        [key]: next,
                      };
                      await saveBody(
                        { ...page.body, counterclaim },
                        undefined,
                        fieldKey,
                      );
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-xl bg-[#F7F8FA] p-3.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              Values in tension, and the crux
            </span>
            <OnePagerEditableField
              value={values?.left ?? ""}
              canEdit={canEdit}
              caseId={caseId}
              label="left value"
              placeholder="Left value"
              displayClassName="text-sm font-semibold"
              flag={flagFor("values_left")}
              onSave={async (next) => {
                await saveBody(
                  {
                    ...page.body,
                    visuals: patchValuesVisual(page.body.visuals, { left: next }),
                  },
                  undefined,
                  "values_left",
                );
              }}
            />
            <OnePagerEditableField
              value={values?.right ?? ""}
              canEdit={canEdit}
              caseId={caseId}
              label="right value"
              placeholder="Right value"
              displayClassName="text-sm font-semibold"
              flag={flagFor("values_right")}
              onSave={async (next) => {
                await saveBody(
                  {
                    ...page.body,
                    visuals: patchValuesVisual(page.body.visuals, {
                      right: next,
                    }),
                  },
                  undefined,
                  "values_right",
                );
              }}
            />
            <OnePagerEditableField
              value={values?.note ?? ""}
              canEdit={canEdit}
              caseId={caseId}
              multiline
              label="values note"
              placeholder="Where we land"
              displayClassName="text-xs text-muted"
              flag={flagFor("values_note")}
              onSave={async (next) => {
                await saveBody(
                  {
                    ...page.body,
                    visuals: patchValuesVisual(page.body.visuals, {
                      note: next || null,
                    }),
                  },
                  undefined,
                  "values_note",
                );
              }}
            />
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-ink/10 p-3.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              Key sources
            </span>
            <OnePagerKeySources visuals={page.body.visuals} />
          </div>
        </section>

        <OnePagerExtras
          visuals={page.body.visuals}
          canEdit={canEdit}
          caseId={caseId}
          onSaveQuestions={async (rows) => {
            const visuals = page.body.visuals.map((v) =>
              v.kind === "question_table"
                ? { ...v, payload: { rows } }
                : v,
            );
            const has = visuals.some((v) => v.kind === "question_table");
            const next = has
              ? visuals
              : [
                  ...visuals,
                  {
                    kind: "question_table" as const,
                    title: "Likely questions",
                    payload: { rows },
                  },
                ];
            await saveBody({ ...page.body, visuals: next }, undefined, "question");
          }}
        />
      </article>

      {diff.length ? (
        <section className="rounded-[20px] bg-white p-5 print:hidden">
          <h2 className="font-display text-xl font-extrabold">
            Diff since last version
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {diff.map((d) => (
              <li key={d.path} className="rounded-xl bg-[#F7F8FA] px-3 py-2">
                <span className="font-mono text-xs text-muted">{d.path}</span>
                <div>
                  <span className="text-muted line-through">
                    {d.before || "(empty)"}
                  </span>
                  {" → "}
                  <span className="text-cardinal">{d.after || "(empty)"}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

type ExtraVisual = { kind: string; payload: unknown };

function OnePagerKeySources({ visuals }: { visuals: ExtraVisual[] }) {
  const get = <T,>(kind: string): T | null =>
    (visuals.find((v) => v.kind === kind)?.payload as T) ?? null;
  const frameworks = (
    get<{ items?: ({ name: string; one_line?: string } | string)[] }>(
      "framework_strip",
    )?.items ?? []
  )
    .map((f) =>
      typeof f === "string"
        ? { name: f, one_line: "" }
        : { name: f.name, one_line: f.one_line ?? "" },
    )
    .filter((f) => f.name.trim());
  if (!frameworks.length) {
    return (
      <p className="m-0 text-sm text-muted">
        Frameworks and named sources appear here as the working document fills
        in.
      </p>
    );
  }
  return (
    <ul className="m-0 space-y-1.5 p-0 text-sm">
      {frameworks.slice(0, 4).map((f) => (
        <li key={f.name} className="list-none">
          <span className="font-semibold">{f.name}</span>
          {f.one_line ? (
            <span className="text-muted">: {f.one_line}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** Likely judge questions with short answers (editable). */
function OnePagerExtras({
  visuals,
  canEdit,
  caseId,
  onSaveQuestions,
}: {
  visuals: ExtraVisual[];
  canEdit: boolean;
  caseId: string;
  onSaveQuestions: (
    rows: { q: string; a?: string }[],
  ) => Promise<void> | void;
}) {
  const get = <T,>(kind: string): T | null =>
    (visuals.find((v) => v.kind === kind)?.payload as T) ?? null;
  const questions = (
    get<{ rows?: { q: string; a?: string }[] }>("question_table")?.rows ?? []
  )
    .filter((r) => r.q)
    .slice(0, 3);
  const label = "text-[11px] font-bold uppercase tracking-[0.12em] text-muted";
  if (!questions.length && !canEdit) return null;
  const rows =
    questions.length > 0
      ? questions
      : [
          { q: "", a: "" },
          { q: "", a: "" },
          { q: "", a: "" },
        ];
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-[#E4E6EB] p-3.5">
      <span className={label}>Three likely judge questions</span>
      <ul className="m-0 space-y-2.5 p-0">
        {rows.map((r, i) => (
          <li key={`q-${i}`} className="list-none text-sm">
            <OnePagerEditableField
              value={r.q}
              canEdit={canEdit}
              caseId={caseId}
              multiline
              label={`question ${i + 1}`}
              placeholder="Judge question"
              displayClassName="font-semibold"
              onSave={async (next) => {
                const nextRows = rows.map((row, j) =>
                  j === i ? { ...row, q: next } : row,
                );
                await onSaveQuestions(nextRows);
              }}
            />
            <OnePagerEditableField
              value={r.a ?? ""}
              canEdit={canEdit}
              caseId={caseId}
              multiline
              label={`answer ${i + 1}`}
              placeholder="Short answer"
              displayClassName="text-muted"
              onSave={async (next) => {
                const nextRows = rows.map((row, j) =>
                  j === i ? { ...row, a: next } : row,
                );
                await onSaveQuestions(nextRows);
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
