"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  OnePagerEditableField,
  RoleNameSkeleton,
} from "@/components/case/one-pager-editable-field";
import { SaveShareMenu } from "@/components/case/save-share-menu";
import {
  emptyClaim,
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

type RoleNames = {
  lead1: string | null;
  lead2: string | null;
  counter: string | null;
  supporter: string | null;
};

type VersionRow = OnePager & { editorName?: string };

type Props = {
  caseId: string;
  teamId: string;
  /** Hide the standalone page chrome when embedded in the case tab. */
  embedded?: boolean;
  className?: string;
};

/**
 * Team one-pager: in-place edit, versions, restore.
 * F embeds this in the case page One pager tab.
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
  const [changeNote, setChangeNote] = useState("");
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [peopleMap, setPeopleMap] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const loadPager = useCallback(async () => {
    if (!teamId || !caseId) return;
    const res = await fetch(
      `/api/revision/one-pagers?teamId=${encodeURIComponent(teamId)}&caseId=${encodeURIComponent(caseId)}`,
    );
    if (!res.ok) {
      setError("Could not load the one pager.");
      return;
    }
    const data = (await res.json()) as {
      onePager: OnePager | null;
      diff: { path: string; before: string; after: string }[];
      canEdit?: boolean;
    };
    setPage(data.onePager);
    setDiff(data.diff ?? []);
    setCanEdit(Boolean(data.canEdit));
    setError(null);
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

  async function saveBody(nextBody: OnePagerBody, note?: string) {
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
          body: withEmptyRows(nextBody),
          changeNote: (note ?? changeNote).trim() || undefined,
        }),
      });
      const data = (await res.json()) as { onePager?: OnePager; error?: string };
      if (!res.ok) {
        setStatus(data.error ?? "Could not save");
        return;
      }
      setPage(data.onePager!);
      setChangeNote("");
      setStatus(`Saved v${data.onePager!.version}`);
      const diffRes = await fetch(
        `/api/revision/one-pagers?id=${encodeURIComponent(data.onePager!.id)}`,
      );
      if (diffRes.ok) {
        const d = (await diffRes.json()) as {
          diff: { path: string; before: string; after: string }[];
        };
        setDiff(d.diff ?? []);
      }
    } finally {
      setBusy(false);
    }
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

  if (!page) {
    return (
      <div className={cn("rounded-[20px] bg-white p-6", className)}>
        <h2 className="font-display m-0 text-2xl font-extrabold">
          No one pager yet
        </h2>
        {canEdit ? (
          <>
            <p className="mt-2 max-w-md text-sm text-muted">
              Cruxy can draft one from this team&apos;s claim map. Then edit each
              line in place.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void draft()}
              className="mt-4 rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Ask Cruxy to draft
            </button>
          </>
        ) : (
          <p className="mt-2 max-w-md text-sm text-muted">
            This team has not drafted a one pager yet. Only that team, Dr. B or
            Jainam can create one.
          </p>
        )}
        {status ? <p className="mt-2 text-xs text-muted">{status}</p> : null}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        {!embedded ? (
          <Link
            href={`/case-brain/${caseId}?teamId=${teamId}`}
            className="text-sm font-semibold"
          >
            Back to the case
          </Link>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!embedded ? (
            <SaveShareMenu
              caseId={caseId}
              teamId={teamId}
              onePagerId={page.id}
              canSaveDrive={canEdit}
              onDriveSaved={(msg) => setStatus(msg)}
            />
          ) : null}
          {canEdit ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => void draft()}
                className="h-10 rounded-[10px] border border-[#C9CCD3] bg-white px-3.5 text-[13px] font-semibold disabled:opacity-50"
              >
                Ask Cruxy to re-draft
              </button>
              <button
                type="button"
                disabled={busy || emptyRows.length > 0}
                onClick={() => void signOff()}
                className="h-10 rounded-[10px] bg-ink px-3.5 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                Sign off v{page.version}
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="h-10 rounded-[10px] border border-[#C9CCD3] bg-white px-3.5 text-[13px] font-semibold"
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
          Read only. This is another team&apos;s one pager. Only that team, Dr. B
          or Jainam can edit.
        </p>
      ) : (
        <label className="flex flex-col gap-1 text-xs text-muted print:hidden">
          Change note (optional)
          <input
            className="h-9 rounded-xl border border-ink/15 bg-white px-3 text-sm text-ink"
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
                    className="h-8 rounded-lg bg-ink px-3 text-xs font-semibold text-white disabled:opacity-50"
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

      <article className="flex w-full flex-col gap-5 rounded-md bg-white px-5 py-6 sm:px-8 sm:py-8">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b-[3px] border-ink pb-3.5">
          <div className="flex items-end gap-4">
            <span className="font-display text-[56px] font-extrabold leading-[0.8] text-cardinal sm:text-[72px]">
              {String(caseRow?.number ?? "").padStart(2, "0")}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                <span>One pager</span>
                <span className="rounded-md bg-[#F7F8FA] px-2 py-0.5 font-semibold normal-case tracking-normal text-[#3B404A]">
                  {team?.name ?? "Team"}
                </span>
                <span className="rounded-md bg-ink px-2 py-0.5 font-semibold normal-case tracking-normal text-white">
                  v{page.version}
                </span>
                {!canEdit ? (
                  <span className="rounded-md bg-[#FFF3C4] px-2 py-0.5 font-semibold normal-case tracking-normal text-[#8A6500]">
                    Read only
                  </span>
                ) : null}
              </div>
              <h1 className="font-display m-0 text-[28px] font-extrabold sm:text-[34px]">
                {caseRow?.title ?? "Case"}
              </h1>
            </div>
          </div>
          <span className="flex max-w-[340px] flex-col items-end gap-0.5 text-right text-[13px] text-muted">
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

        <section className="rounded-xl bg-ink px-5 py-4 text-white">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-gold">
            Our answer in one sentence
          </div>
          <div className="font-display mt-1.5 text-[20px] font-semibold leading-snug sm:text-[22px]">
            <OnePagerEditableField
              value={thesis}
              canEdit={canEdit}
              multiline
              label="one-sentence answer"
              placeholder="Tap to write the answer"
              displayClassName="text-white"
              onSave={async (next) => {
                const language = { ...ensureLanguage(page.body), plain: next };
                const visuals = syncThesisVisual(page.body.visuals, next);
                await saveBody({ ...page.body, language, visuals });
              }}
            />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          {page.body.claims.map((c, i) => (
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
                    className="text-xs font-semibold text-cardinal underline"
                    onClick={() => {
                      const claims = page.body.claims.filter((_, j) => j !== i);
                      void saveBody({ ...page.body, claims });
                    }}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <OnePagerEditableField
                value={c.text}
                canEdit={canEdit}
                multiline
                label={`claim ${i + 1}`}
                displayClassName="text-[15px] font-semibold"
                onSave={async (next) => {
                  const claims = page.body.claims.map((row, j) =>
                    j === i ? { ...row, text: next } : row,
                  );
                  await saveBody({ ...page.body, claims });
                }}
              />
              <div className="text-xs font-bold uppercase tracking-[0.1em] text-muted">
                Logic line
              </div>
              <OnePagerEditableField
                value={c.logic_line}
                canEdit={canEdit}
                multiline
                label={`logic ${i + 1}`}
                displayClassName="text-sm"
                onSave={async (next) => {
                  const claims = page.body.claims.map((row, j) =>
                    j === i ? { ...row, logic_line: next } : row,
                  );
                  await saveBody({ ...page.body, claims });
                }}
              />
              <div className="mt-1 grid gap-2 sm:grid-cols-3">
                {c.supports.map((s, j) => (
                  <div
                    key={`s-${i}-${j}`}
                    className="rounded-[10px] border border-ink/20 bg-white p-2.5"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <strong className="text-xs">S{j + 1}</strong>
                      {canEdit && c.supports.length > 1 ? (
                        <button
                          type="button"
                          className="text-[11px] text-cardinal underline"
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
                            void saveBody({ ...page.body, claims });
                          }}
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <OnePagerEditableField
                      value={s}
                      canEdit={canEdit}
                      multiline
                      label={`support ${i + 1}-${j + 1}`}
                      displayClassName="text-[13px] leading-snug"
                      onSave={async (next) => {
                        const claims = page.body.claims.map((row, ci) => {
                          if (ci !== i) return row;
                          const supports = row.supports.map((sup, sj) =>
                            sj === j ? next : sup,
                          );
                          return { ...row, supports };
                        });
                        await saveBody({ ...page.body, claims });
                      }}
                    />
                  </div>
                ))}
              </div>
              {canEdit ? (
                <button
                  type="button"
                  className="self-start text-xs font-semibold underline"
                  onClick={() => {
                    const claims = page.body.claims.map((row, ci) =>
                      ci === i
                        ? { ...row, supports: [...row.supports, ""] }
                        : row,
                    );
                    void saveBody({ ...page.body, claims });
                  }}
                >
                  Add support
                </button>
              ) : null}
            </div>
          ))}
          {canEdit ? (
            <button
              type="button"
              className="self-start rounded-xl border border-ink/20 bg-white px-3 py-2 text-sm font-semibold"
              onClick={() => {
                void saveBody({
                  ...page.body,
                  claims: [...page.body.claims, emptyClaim()],
                });
              }}
            >
              Add claim
            </button>
          ) : null}
        </section>

        <section className="flex flex-col gap-2 rounded-xl border-2 border-cardinal p-3.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-cardinal">
            Counterclaim and our answer
          </span>
          <OnePagerEditableField
            value={page.body.counterclaim?.text ?? ""}
            canEdit={canEdit}
            multiline
            label="counterclaim"
            displayClassName="text-[15px] font-semibold"
            placeholder="Tap to add the counterclaim"
            onSave={async (next) => {
              const counterclaim = {
                ...ensureCounterclaim(page.body),
                text: next,
              };
              await saveBody({ ...page.body, counterclaim });
            }}
          />
          <div className="grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-3">
            {(
              [
                ["concede", "Concede"],
                ["distinguish", "Distinguish"],
                ["rebut", "Rebut"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="rounded-xl bg-[#F7F8FA] p-3">
                <strong>{label}</strong>
                <div className="mt-1">
                  <OnePagerEditableField
                    value={page.body.counterclaim?.[key] ?? ""}
                    canEdit={canEdit}
                    multiline
                    label={label}
                    placeholder="Tap to add"
                    onSave={async (next) => {
                      const counterclaim = {
                        ...ensureCounterclaim(page.body),
                        [key]: next,
                      };
                      await saveBody({ ...page.body, counterclaim });
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-xl bg-[#F7F8FA] p-3.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              Values in tension
            </span>
            <OnePagerEditableField
              value={values?.left ?? ""}
              canEdit={canEdit}
              label="left value"
              placeholder="Left value"
              displayClassName="text-sm font-semibold"
              onSave={async (next) => {
                await saveBody({
                  ...page.body,
                  visuals: patchValuesVisual(page.body.visuals, { left: next }),
                });
              }}
            />
            <OnePagerEditableField
              value={values?.right ?? ""}
              canEdit={canEdit}
              label="right value"
              placeholder="Right value"
              displayClassName="text-sm font-semibold"
              onSave={async (next) => {
                await saveBody({
                  ...page.body,
                  visuals: patchValuesVisual(page.body.visuals, {
                    right: next,
                  }),
                });
              }}
            />
            <OnePagerEditableField
              value={values?.note ?? ""}
              canEdit={canEdit}
              multiline
              label="values note"
              placeholder="Where we land"
              displayClassName="text-xs text-muted"
              onSave={async (next) => {
                await saveBody({
                  ...page.body,
                  visuals: patchValuesVisual(page.body.visuals, {
                    note: next || null,
                  }),
                });
              }}
            />
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-ink/10 p-3.5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
              Language
            </span>
            <OnePagerEditableField
              value={page.body.language?.plain ?? ""}
              canEdit={canEdit}
              multiline
              label="plain language"
              placeholder="Plain line"
              displayClassName="text-sm"
              onSave={async (next) => {
                const language = { ...ensureLanguage(page.body), plain: next };
                await saveBody({ ...page.body, language });
              }}
            />
            <OnePagerEditableField
              value={page.body.language?.vivid ?? ""}
              canEdit={canEdit}
              multiline
              label="vivid line"
              placeholder="Vivid example"
              displayClassName="text-sm"
              onSave={async (next) => {
                const language = { ...ensureLanguage(page.body), vivid: next };
                await saveBody({ ...page.body, language });
              }}
            />
            <OnePagerEditableField
              value={(page.body.language?.analogies ?? []).join("\n")}
              canEdit={canEdit}
              multiline
              label="analogies"
              placeholder="One analogy per line"
              displayClassName="text-sm whitespace-pre-wrap"
              onSave={async (next) => {
                const analogies = next
                  .split("\n")
                  .map((l) => l.trim())
                  .filter(Boolean);
                const language = {
                  ...ensureLanguage(page.body),
                  analogies,
                };
                await saveBody({ ...page.body, language });
              }}
            />
            <OnePagerEditableField
              value={(page.body.language?.avoid ?? []).join(", ")}
              canEdit={canEdit}
              label="words to avoid"
              placeholder="Words to avoid, comma separated"
              displayClassName="text-sm"
              onSave={async (next) => {
                const avoid = next
                  .split(",")
                  .map((l) => l.trim())
                  .filter(Boolean);
                const language = { ...ensureLanguage(page.body), avoid };
                await saveBody({ ...page.body, language });
              }}
            />
          </div>
        </section>
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
