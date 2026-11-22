"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CaseMoreList, type MoreSection } from "@/components/case/case-more-panel";
import { OnePagerPanel } from "@/components/case/one-pager-panel";
import { CaseReadings } from "@/components/case/case-readings";
import { IdeasOverTime } from "@/components/case/ideas-over-time";
import { TheCaseTab } from "@/components/case/the-case-tab";
import { WorkingDocument } from "@/components/case/working-document";
import { OfflineCaseButton } from "@/components/offline/offline-case-button";
import { Skeleton, SkeletonBlock } from "@/components/motion/skeleton";
import { ClaimRobustness } from "@/components/case-brain/claim-robustness";
import { OriginTag } from "@/components/case-brain/origin-tag";
import {
  backingChip,
  supportLabel,
} from "@/components/case-brain/support-label";
import { VersionConfirm } from "@/components/case-brain/version-confirm";
import {
  TeamBriefPanel,
  suggestionKindFromOrigin,
} from "@/components/case-brain/team-brief-panel";
import { FindingCard } from "@/components/cruxy/finding-card";
import {
  ClaimResearchDossierView,
  ResearchBriefCard,
} from "@/components/cruxy/claim-research-dossier";
import { emitMood } from "@/components/cruxy/mood/bus";
import { coverageFromFindings } from "@/lib/cruxy/research-gaps";
import type {
  CaseBrainSnapshot,
  CaseRoleKind,
  DecisionVerdict,
} from "@/lib/case-brain/types";
import type { CaseRow, Team } from "@/lib/types";
import { cn } from "@/lib/utils";

type PrimaryTab = "reading" | "working" | "one_pager" | "more";

const MORE_SECTIONS = new Set<MoreSection>([
  "brief",
  "ideas",
  "map",
  "truth",
  "flashcards",
  "questions",
  "research",
]);

function resolveTabParam(raw: string | null): {
  primary: PrimaryTab;
  more: MoreSection | null;
} {
  if (!raw) return { primary: "reading", more: null };
  if (raw === "reading" || raw === "case" || raw === "readings") {
    return { primary: "reading", more: null };
  }
  if (raw === "working") return { primary: "working", more: null };
  if (raw === "one_pager" || raw === "one-pager") {
    return { primary: "one_pager", more: null };
  }
  if (raw === "more") return { primary: "more", more: null };
  if (MORE_SECTIONS.has(raw as MoreSection)) {
    return { primary: "more", more: raw as MoreSection };
  }
  return { primary: "reading", more: null };
}

type PersonLite = { id: string; name: string; team_id: string | null };

type MapVersionMeta = {
  id: string;
  version: number;
  change_summary: string;
  confirmed_by: string[];
  confirmed_count: number;
  team_size: number;
  viewer_confirmed: boolean;
  unconfirmed_names: string[];
  diff_lines: { path: string; before: string; after: string }[];
};

type ResearchPayload = {
  id: string;
  stub: boolean;
  created_at: string;
  gaps: Array<{ kind: string; claim_ref: string; detail: string }>;
  findings: Array<{
    id: string;
    point: string;
    why_it_matters: string;
    claim_ref: string;
    quote: string;
    link: string;
    verified: boolean;
    needs_check: boolean;
    citation?: string | null;
    open_access?: boolean | null;
  }>;
  claim_dossiers?: import("@/lib/library/types").ClaimSourceDossier[] | null;
  brief?: import("@/lib/library/types").ResearchBrief | null;
};

type Payload = {
  case: CaseRow | null;
  teams: Team[];
  people: PersonLite[];
  brain: CaseBrainSnapshot;
  research?: ResearchPayload | null;
  canEdit: boolean;
  /** Dr. B / Jainam in admin view may open every team's case materials. */
  canSeeAllTeams?: boolean;
  viewer: { personId: string; teamId: string; name: string };
  meta: {
    truth_count: number;
    truth_accepted: number;
    truth_rejected: number;
    truth_waiting: number;
    flashcard_count: number;
    question_count: number;
    reading_count: number;
    also_studying: string[];
    map_version: MapVersionMeta | null;
  };
};

const ROLE_KEYS: CaseRoleKind[] = [
  "lead_1",
  "lead_2",
  "counter_arguer",
  "supporter",
];

const ROLE_LABELS: Record<CaseRoleKind, string> = {
  lead_1: "Lead 1",
  lead_2: "Lead 2",
  counter_arguer: "Counter-arguer",
  supporter: "Supporter",
};

const TEAM_COLOUR: Record<string, string> = {
  "Team 1": "var(--crux-team-1)",
  "Team 2": "var(--crux-team-2)",
  "Team 3": "var(--crux-team-3)",
};

function originLabel(
  proposal: CaseBrainSnapshot["proposals"][number],
  teams: Team[],
  seeAllTeams: boolean,
) {
  if (proposal.origin === "inspired_by_team") {
    // Members never learn which USC team an idea came from.
    if (!seeAllTeams) return "A strong idea from elsewhere";
    const t = teams.find((x) => x.id === proposal.inspired_from_team_id);
    return t ? `Inspired by ${t.name}` : "Inspired by Team";
  }
  if (proposal.origin === "research") return "Cruxy research";
  if (proposal.origin === "transcript") {
    const ref = proposal.origin_ref ?? "";
    if (ref.startsWith("From practice")) return ref;
    // A bare round id means nothing to a person; show when it came from.
    const looksLikeId = /^[0-9a-f-]{20,}$/i.test(ref.trim());
    const when = new Date(proposal.created_at);
    const date = Number.isNaN(when.getTime())
      ? ""
      : `, ${when.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    if (!ref || looksLikeId) return `From a practice round${date}`;
    return `From practice, ${ref}`;
  }
  if (proposal.origin === "reading") return "Reading room";
  if (proposal.origin === "team_doc") return "Team doc";
  return "Team member";
}

function personName(
  people: PersonLite[],
  id: string | null | undefined,
): string {
  if (!id) return "";
  return people.find((p) => p.id === id)?.name ?? "";
}

function formatCrux(crux: string | null | undefined): {
  left: string;
  right: string;
} {
  if (!crux) return { left: "", right: "" };
  const parts = crux.split(/\s*\*?versus\*?\s*/i);
  if (parts.length >= 2) {
    return {
      left: parts[0]!.replace(/\*/g, "").trim(),
      right: parts.slice(1).join(" versus ").replace(/\*/g, "").trim(),
    };
  }
  return { left: crux.replace(/\*/g, "").trim(), right: "" };
}

export function CaseBrainClient({
  caseId,
  initialTeamId,
}: {
  caseId: string;
  initialTeamId?: string;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [teamId, setTeamId] = useState(initialTeamId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const focusFileId = searchParams.get("file");
  const resolved = resolveTabParam(initialTab);
  const [tab, setTab] = useState<PrimaryTab>(resolved.primary);
  const [moreSection, setMoreSection] = useState<MoreSection | null>(
    resolved.more,
  );
  const [rolesOpen, setRolesOpen] = useState(false);
  const [compare, setCompare] = useState(false);
  const [briefMode, setBriefMode] = useState<"own_doc" | "build_in_crux" | null>(
    null,
  );

  useEffect(() => {
    const next = resolveTabParam(initialTab);
    setTab(next.primary);
    setMoreSection(next.more);
  }, [initialTab]);

  const load = useCallback(
    async (tid?: string) => {
      setError(null);
      const q = tid ? `?teamId=${encodeURIComponent(tid)}` : "";
      const res = await fetch(`/api/case-brain/${caseId}${q}`);
      const json = (await res.json()) as Payload & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Failed to load case brain");
        return;
      }
      setData(json);
      setTeamId(json.brain.team_id);
    },
    [caseId],
  );

  useEffect(() => {
    void load(initialTeamId);
  }, [load, initialTeamId]);

  useEffect(() => {
    if (!teamId || !caseId) return;
    void fetch(
      `/api/case-brain/brief?caseId=${encodeURIComponent(caseId)}&teamId=${encodeURIComponent(teamId)}`,
    )
      .then((r) => r.json())
      .then((j: { brief?: { mode?: "own_doc" | "build_in_crux" } }) => {
        if (j.brief?.mode) setBriefMode(j.brief.mode);
      })
      .catch(() => undefined);
  }, [caseId, teamId]);

  const teamPeople = useMemo(() => {
    if (!data) return [];
    return data.people.filter((p) => p.team_id === data.brain.team_id);
  }, [data]);

  async function api(
    url: string,
    init: RequestInit,
  ): Promise<{ ok: boolean; error?: string }> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(init.headers ?? {}),
        },
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Request failed");
        return { ok: false, error: json.error };
      }
      await load(teamId);
      return { ok: true };
    } finally {
      setBusy(false);
    }
  }

  async function decide(proposalId: string, verdict: DecisionVerdict) {
    const reason = reasonDrafts[`prop:${proposalId}`]?.trim() ?? "";
    if (!reason) {
      setError("A reason is required for every accept, reject or edit.");
      return;
    }
    const proposal = data?.brain.proposals.find((p) => p.id === proposalId);
    // Accept / edit go through Team Brief so own-doc mode becomes a checklist item.
    if (verdict === "accept" || verdict === "edit") {
      await api("/api/case-brain/brief", {
        method: "POST",
        body: JSON.stringify({
          action: "accept_suggestion",
          caseId,
          teamId,
          proposalId,
          reason,
          text: proposal?.text ?? "",
          editedText:
            verdict === "edit" ? (editDrafts[proposalId] ?? null) : null,
          kind: suggestionKindFromOrigin(proposal?.origin ?? "member"),
        }),
      });
      emitMood({ type: "idea.accepted" });
      return;
    }
    await api("/api/case-brain/decisions", {
      method: "POST",
      body: JSON.stringify({
        proposalId,
        verdict,
        reason,
        editedText: editDrafts[proposalId] ?? null,
      }),
    });
  }

  if (!data) {
    if (error) {
      return <p className="text-sm text-cardinal">{error}</p>;
    }
    return (
      <div className="flex flex-col gap-5" aria-busy aria-label="Loading case">
        <div className="flex items-end gap-5">
          <Skeleton className="h-[96px] w-[96px]" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-72 max-w-full" />
            <SkeletonBlock lines={2} className="max-w-md" />
          </div>
        </div>
        <Skeleton className="h-5 w-full max-w-xl" />
        <Skeleton className="h-10 w-full max-w-lg" rounded="lg" />
        <Skeleton className="h-64 w-full" rounded="lg" />
      </div>
    );
  }

  const { brain, case: caseRow, teams, canEdit, meta, viewer } = data;
  const originRank = (o: string) =>
    o === "inspired_by_team" ? 0 : o === "transcript" ? 1 : o === "research" ? 2 : 3;
  const pending = brain.proposals
    .filter((p) => p.status === "pending")
    .sort((a, b) => originRank(a.origin) - originRank(b.origin));
  const viewingTeam = teams.find((t) => t.id === brain.team_id);
  const crux = formatCrux(caseRow?.crux);
  const caseNum = String(caseRow?.number ?? "").padStart(2, "0");
  const lead1 = brain.case_roles.find((r) => r.role === "lead_1");
  const lead2 = brain.case_roles.find((r) => r.role === "lead_2");
  const counter = brain.case_roles.find((r) => r.role === "counter_arguer");
  const allCounterclaims = brain.claims.flatMap((n) =>
    n.counterclaims.map((cc) => ({
      ...cc,
      owner: personName(data.people, counter?.person_id),
    })),
  );

  const leadNames = [lead1, lead2]
    .map((r) => personName(data.people, r?.person_id))
    .filter(Boolean);
  const counterName = personName(data.people, counter?.person_id);
  const supporterName = personName(
    data.people,
    brain.case_roles.find((r) => r.role === "supporter")?.person_id,
  );
  const rolesLineParts = [
    leadNames.length ? `Leads: ${leadNames.join(", ")}` : null,
    counterName ? `Counter: ${counterName}` : null,
    supporterName ? `Supporter: ${supporterName}` : null,
  ].filter(Boolean);

  // Design shows "No backing yet" plus waiting count on the first unbacked support only.
  let firstMissingSupportId: string | null = null;
  for (const node of brain.claims) {
    for (const s of node.supports) {
      if (s.backings.length === 0) {
        firstMissingSupportId = s.support.id;
        break;
      }
    }
    if (firstMissingSupportId) break;
  }

  return (
    <div className="flex flex-col gap-5 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex items-end gap-5">
          <span className="font-display text-[120px] font-extrabold leading-[0.8] tracking-[-0.05em] text-cardinal">
            {caseNum}
          </span>
          <div className="flex max-w-[620px] flex-col gap-1.5">
            <span className="flex flex-wrap items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-muted">
              <span>Case brain</span>
              <span className="rounded-md bg-mist px-2 py-0.5 font-semibold normal-case tracking-normal text-[#3B404A]">
                {viewingTeam?.name ?? "Team"}
              </span>
              {meta.map_version ? (
                <span className="rounded-md bg-ink px-2 py-0.5 font-semibold normal-case tracking-normal text-white">
                  v{meta.map_version.version}
                </span>
              ) : null}
            </span>
            <h1 className="font-display m-0 text-[44px] font-extrabold leading-none tracking-[-0.02em]">
              {caseRow?.title ?? "Case"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <OfflineCaseButton
                caseId={caseId}
                teamId={teamId || brain.team_id}
              />
              <Link
                href={`/case-brain/${caseId}/packet?team=${encodeURIComponent(teamId || brain.team_id)}`}
                className="rounded-xl border border-[#E3E5E9] bg-white px-3 py-2 text-sm font-semibold"
              >
                Print packet
              </Link>
            </div>
            {crux.left ? (
              <p className="m-0 text-base text-[#3B404A]">
                Crux: {crux.left}
                {crux.right ? (
                  <>
                    {" "}
                    <em>versus</em> {crux.right}
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>

        {data.canSeeAllTeams ? (
          <div
            role="tablist"
            aria-label="Whose case brain"
            className="flex gap-1 rounded-xl bg-mist p-1"
          >
            {teams.map((t) => {
              const selected = !compare && t.id === brain.team_id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={cn(
                    "rounded-[10px] px-3.5 py-2 text-[13px] font-semibold",
                    selected ? "bg-white" : "bg-transparent text-[#3B404A]",
                  )}
                  style={
                    selected
                      ? { color: TEAM_COLOUR[t.name] ?? "#111318" }
                      : undefined
                  }
                  onClick={() => {
                    setCompare(false);
                    setTeamId(t.id);
                    void load(t.id);
                  }}
                >
                  {t.name}
                </button>
              );
            })}
            <button
              type="button"
              role="tab"
              aria-selected={compare}
              className={cn(
                "rounded-[10px] px-3.5 py-2 text-[13px] font-semibold",
                compare ? "bg-white text-ink" : "bg-transparent text-[#3B404A]",
              )}
              onClick={() => setCompare(true)}
            >
              Compare
            </button>
          </div>
        ) : (
          <p className="m-0 text-[13px] font-semibold text-[#3B404A]">
            {teams.find((t) => t.id === brain.team_id)?.name ?? "Your team"}
          </p>
        )}
      </div>

      {error ? (
        <p className="rounded-xl border border-cardinal/30 bg-cardinal/5 px-3 py-2 text-sm text-cardinal">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#3B404A]">
        <p className="m-0">
          {rolesLineParts.length
            ? `${rolesLineParts.join(". ")}.`
            : "Roles not assigned yet."}
        </p>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setRolesOpen((v) => !v)}
            className="font-semibold text-cardinal underline"
          >
            Change
          </button>
        ) : (
          <Link
            href="/team/roles"
            className="font-semibold text-cardinal underline"
          >
            Roles board
          </Link>
        )}
      </div>

      {rolesOpen ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ROLE_KEYS.map((role) => {
            const current = brain.case_roles.find((r) => r.role === role);
            return (
              <label
                key={role}
                className="flex flex-col gap-1.5 rounded-[14px] bg-white px-3.5 py-3"
              >
                <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-muted">
                  {ROLE_LABELS[role]}
                </span>
                <select
                  disabled={!canEdit || busy}
                  className="h-9 rounded-[10px] border border-mist bg-[#F7F8FA] px-2 text-sm font-semibold text-ink disabled:opacity-60"
                  value={current?.person_id ?? ""}
                  onChange={(e) => {
                    const personId = e.target.value;
                    if (!personId) return;
                    void api("/api/case-brain/roles", {
                      method: "POST",
                      body: JSON.stringify({ caseId, personId, role }),
                    });
                  }}
                >
                  <option value="">Choose…</option>
                  {teamPeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      ) : null}

      <nav
        aria-label="Case sections"
        className="flex flex-wrap gap-1 border-b border-mist"
      >
        {(
          [
            ["reading", "Reading"],
            ["working", "Working document"],
            ["one_pager", "One pager"],
            ["more", "More"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              if (id !== "more") setMoreSection(null);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 border-b-[3px] px-3.5 py-2.5 text-sm font-semibold",
              tab === id
                ? "border-cardinal text-ink"
                : "border-transparent text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      {compare && data.canSeeAllTeams ? (
        <ComparePanel caseId={caseId} teams={teams} />
      ) : (
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-[999_1_620px] flex-col gap-4">
            {tab === "reading" ? (
              <div className="flex flex-col gap-6">
                <TheCaseTab
                  caseId={caseId}
                  teamId={teamId || brain.team_id}
                />
                <CaseReadings
                  caseId={caseId}
                  teamId={teamId || brain.team_id}
                  focusFileId={focusFileId}
                />
              </div>
            ) : null}

            {tab === "working" ? (
              <WorkingDocument
                caseId={caseId}
                teamId={teamId || brain.team_id}
              />
            ) : null}

            {tab === "one_pager" ? (
              <OnePagerPanel
                caseId={caseId}
                teamId={teamId || brain.team_id}
                embedded
              />
            ) : null}

            {tab === "more" ? (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="font-display m-0 text-xl font-extrabold">
                    More for this case
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    Claim map, evidence, cards, questions, research and history.
                  </p>
                </div>
                <CaseMoreList
                  active={moreSection}
                  onPick={setMoreSection}
                  counts={{
                    truth: meta.truth_count,
                    flashcard: meta.flashcard_count,
                    question: meta.question_count,
                    reading: meta.reading_count,
                  }}
                />
              </div>
            ) : null}

            {tab === "more" && moreSection === "brief" ? (
              <TeamBriefPanel
                caseId={caseId}
                teamId={teamId}
                canEdit={canEdit}
                busy={busy}
                onBusy={setBusy}
                onError={setError}
                onChanged={() => {
                  void load(teamId);
                  void fetch(
                    `/api/case-brain/brief?caseId=${encodeURIComponent(caseId)}&teamId=${encodeURIComponent(teamId)}`,
                  )
                    .then((r) => r.json())
                    .then((j: { brief?: { mode?: "own_doc" | "build_in_crux" } }) => {
                      if (j.brief?.mode) setBriefMode(j.brief.mode);
                    })
                    .catch(() => undefined);
                }}
              />
            ) : null}

            {tab === "more" && moreSection === "map" ? (
              <>
                {Object.keys(brain.peer_claim_scores ?? {}).length > 0 ? (
                  <div className="rounded-[14px] bg-[#F7F8FA] px-3.5 py-3 text-[12px] text-[#3B404A]">
                    <p className="m-0 font-semibold text-ink">
                      Robustness across teams
                    </p>
                    <ul className="mt-1.5 m-0 list-none space-y-1 p-0">
                      {Object.values(brain.peer_claim_scores).map((peer) => {
                        const open = peer.scores.reduce(
                          (n, s) => n + s.attacks_open,
                          0,
                        );
                        const answered = peer.scores.reduce(
                          (n, s) => n + s.attacks_answered,
                          0,
                        );
                        const avg =
                          peer.scores.length === 0
                            ? 0
                            : Math.round(
                                peer.scores.reduce(
                                  (n, s) => n + s.score_pct,
                                  0,
                                ) / peer.scores.length,
                              );
                        return (
                          <li key={peer.team_name}>
                            {peer.team_name}: {avg}% avg, {answered} attacks
                            answered, {open} open
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
                {brain.claims.map((node, idx) => {
                  const backed = node.supports.filter(
                    (s) => s.backings.length > 0,
                  ).length;
                  const ownerId =
                    idx === 0 ? lead1?.person_id : lead2?.person_id;
                  return (
                    <section
                      key={node.claim.id}
                      className="flex flex-col gap-3.5 rounded-[20px] bg-white p-[22px]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="flex items-center gap-2.5">
                          <span className="font-display rounded-lg bg-ink px-2.5 py-1 text-[15px] font-extrabold text-white">
                            C{idx + 1}
                          </span>
                          <span className="text-[13px] text-muted">
                            {personName(data.people, ownerId)
                              ? `${personName(data.people, ownerId)}, `
                              : ""}
                            {backed} of {node.supports.length || 3} supports
                            backed
                          </span>
                        </span>
                        <ClaimRobustness
                          backed={backed}
                          total={node.supports.length || 3}
                          graphScore={brain.claim_scores?.[node.claim.id]}
                        />
                      </div>
                      <h2 className="font-display m-0 text-[26px] font-semibold leading-[1.15]">
                        {node.claim.text}
                      </h2>
                      {node.claim.logic_line ? (
                        <p className="m-0 font-mono text-sm font-medium text-[#3B404A]">
                          {node.claim.logic_line.startsWith("Because")
                            ? node.claim.logic_line
                            : `Because ${node.claim.logic_line}`}
                        </p>
                      ) : null}
                      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
                        {[0, 1, 2].map((j) => {
                          const s = node.supports[j];
                          if (!s) {
                            return (
                              <div
                                key={`empty-${j}`}
                                className="flex flex-col gap-2 rounded-[14px] border-2 border-dashed border-[#C62828] bg-white p-3.5"
                              >
                                <strong className="flex items-center gap-2 text-sm">
                                  <span className="rounded-md bg-ink px-1.5 py-0.5 font-mono text-[11px] font-bold text-white">
                                    S{j + 1}
                                  </span>
                                  Waiting
                                </strong>
                                <span className="text-[13px] font-semibold text-[#C62828]">
                                  No backing yet
                                </span>
                              </div>
                            );
                          }
                          const { title, body } = supportLabel(s.support.text);
                          const missing = s.backings.length === 0;
                          return (
                            <div
                              key={s.support.id}
                              className={cn(
                                "flex flex-col gap-2 rounded-[14px] p-3.5",
                                missing
                                  ? "border-2 border-dashed border-[#C62828] bg-white"
                                  : "bg-[#F7F8FA]",
                              )}
                            >
                              <strong className="flex items-center gap-2 text-sm">
                                <span className="rounded-md bg-ink/90 px-1.5 py-0.5 font-mono text-[11px] font-bold text-white">
                                  S{j + 1}
                                </span>
                                {title}
                              </strong>
                              {body ? (
                                <span className="text-sm leading-snug text-[#3B404A]">
                                  {body}
                                </span>
                              ) : null}
                              {missing ? (
                                <span className="text-[13px] font-semibold text-[#C62828]">
                                  No backing yet
                                  {s.support.id === firstMissingSupportId &&
                                  pending.length
                                    ? `, ${pending.length} waiting in the queue`
                                    : ""}
                                </span>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {s.backings.map((b) => (
                                    <span
                                      key={b.id}
                                      className="inline-flex items-center rounded-md bg-paper px-2 py-0.5 font-mono text-[12px] font-medium text-[#3B404A]"
                                    >
                                      {backingChip(b)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}

                {allCounterclaims[0] ? (
                  <section className="flex flex-col gap-2.5 rounded-[20px] bg-ink p-[22px] text-white">
                    <span className="flex items-center gap-2.5">
                      <span className="font-display rounded-lg bg-white px-2.5 py-1 text-[15px] font-extrabold text-ink">
                        vs
                      </span>
                      <span className="text-[13px] text-[#9AA0AA]">
                        Counterclaim
                        <span className="ml-2 rounded-md bg-white/10 px-2 py-0.5 font-semibold text-white">
                          {allCounterclaims[0].owner}
                        </span>
                      </span>
                    </span>
                    <h2 className="font-display m-0 text-2xl font-semibold leading-tight">
                      {allCounterclaims[0].text.startsWith('"') ||
                      allCounterclaims[0].text.startsWith("\u201C")
                        ? allCounterclaims[0].text
                        : `\u201C${allCounterclaims[0].text}\u201D`}
                    </h2>
                    <p className="m-0 text-[15px] leading-relaxed text-[#D6D9DF]">
                      <strong className="text-white">Concede</strong>{" "}
                      {allCounterclaims[0].concede || "—"}.{" "}
                      <strong className="text-white">Distinguish:</strong>{" "}
                      {allCounterclaims[0].distinguish || "—"}.{" "}
                      <strong className="text-white">Rebut:</strong>{" "}
                      {allCounterclaims[0].rebut || "—"}.
                    </p>
                  </section>
                ) : null}

                <VersionConfirm
                  version={meta.map_version?.version ?? null}
                  changeSummary={meta.map_version?.change_summary ?? null}
                  confirmedCount={meta.map_version?.confirmed_count ?? 0}
                  teamSize={meta.map_version?.team_size ?? teamPeople.length}
                  unconfirmedNames={meta.map_version?.unconfirmed_names ?? []}
                  diffLines={meta.map_version?.diff_lines ?? []}
                  canConfirm={
                    Boolean(
                      canEdit &&
                        meta.map_version &&
                        !meta.map_version.viewer_confirmed,
                    )
                  }
                  canPublish={canEdit}
                  busy={busy}
                  onConfirm={() => {
                    if (!meta.map_version) return;
                    void api(`/api/case-brain/${caseId}`, {
                      method: "POST",
                      body: JSON.stringify({
                        action: "confirm_version",
                        versionId: meta.map_version.id,
                      }),
                    });
                  }}
                  onPublish={(changeSummary) => {
                    void api(`/api/case-brain/${caseId}`, {
                      method: "POST",
                      body: JSON.stringify({
                        action: "publish_version",
                        changeSummary,
                      }),
                    });
                  }}
                  onEnsure={
                    canEdit
                      ? () => {
                          void api(`/api/case-brain/${caseId}`, {
                            method: "POST",
                            body: JSON.stringify({ action: "ensure_version" }),
                          });
                        }
                      : undefined
                  }
                />

                <section className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] bg-white px-[22px] py-[18px]">
                  <span className="text-sm leading-snug">
                    <strong>
                      Flashcards from these readings, {meta.flashcard_count}{" "}
                      cards.
                    </strong>{" "}
                    {leadNames.length
                      ? `Leads ${leadNames.join(" and ")} get them automatically`
                      : "Leads get them automatically"}
                    {meta.also_studying.length
                      ? `. Also studying: ${meta.also_studying.join(", ")} `
                      : ". "}
                    {meta.also_studying.length ? (
                      <span className="font-semibold text-[#8A6500]">
                        (not assigned)
                      </span>
                    ) : null}
                  </span>
                  <Link
                    href={`/revision/flashcards?caseId=${caseId}`}
                    className="rounded-xl bg-ink px-[18px] py-3 text-sm font-semibold text-white"
                  >
                    Study the deck
                  </Link>
                </section>
              </>
            ) : null}

            {tab === "more" && moreSection === "truth" ? (
              <section className="space-y-3">
                <div className="rounded-[20px] bg-white p-5">
                  <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                    Evidence Library
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    Shared facts, sources and citations. Evidence only, never a
                    stance.
                  </p>
                  <p className="mt-2 flex flex-wrap gap-2 text-base leading-snug">
                    <span className="rounded-md bg-[#E8F5E9] px-2 py-0.5 text-sm font-semibold text-[#1B5E20]">
                      {meta.truth_accepted} accepted
                    </span>
                    <span className="rounded-md bg-[#FFEBEE] px-2 py-0.5 text-sm font-semibold text-[#C62828]">
                      {meta.truth_rejected} rejected
                    </span>
                    <span className="rounded-md bg-[#FFF8E1] px-2 py-0.5 text-sm font-semibold text-[#8A6500]">
                      {meta.truth_waiting} waiting for{" "}
                      {viewingTeam?.name ?? "this team"}
                    </span>
                  </p>
                </div>
                {brain.truth_items.length === 0 ? (
                  <p className="text-sm text-muted">
                    No Evidence Library entries yet.
                  </p>
                ) : (
                  brain.truth_items.map((t) => (
                    <article
                      key={t.id}
                      className="rounded-[20px] bg-white p-5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <OriginTag label={t.kind} />
                        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
                          {t.status}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-snug">{t.text}</p>
                      <p className="mt-1 font-mono text-[11px] text-muted">
                        {t.citation_ids.length
                          ? t.citation_ids.join(", ")
                          : "needs check"}
                      </p>
                    </article>
                  ))
                )}
              </section>
            ) : null}

            {tab === "more" && moreSection === "flashcards" ? (
              <section className="rounded-[20px] bg-white p-5">
                <p className="text-sm">
                  {meta.flashcard_count} cards for this case. Leads get the deck
                  automatically.
                </p>
                <Link
                  href={`/revision/flashcards?caseId=${caseId}`}
                  className="mt-3 inline-flex rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white"
                >
                  Study the deck
                </Link>
              </section>
            ) : null}

            {tab === "more" && moreSection === "questions" ? (
              <section className="rounded-[20px] bg-white p-5">
                <p className="text-sm">
                  {meta.question_count} questions in the bank for this case.
                </p>
                <Link
                  href={`/revision/questions?caseId=${caseId}`}
                  className="mt-3 inline-flex rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white"
                >
                  Open the bank
                </Link>
              </section>
            ) : null}

            {tab === "more" && moreSection === "ideas" ? (
              <IdeasOverTime caseId={caseId} teamId={teamId || brain.team_id} />
            ) : null}

            {tab === "more" && moreSection === "research" ? (
              <div className="space-y-4">
                <ResearchCoverage
                  brain={brain}
                  research={data.research ?? null}
                />
                {data.research?.brief ? (
                  <ResearchBriefCard
                    summary={data.research.brief.summary}
                    judgmentChanges={data.research.brief.judgment_changes}
                    judgmentDoesNot={data.research.brief.judgment_does_not}
                  />
                ) : null}
                {data.research?.claim_dossiers?.length ? (
                  <section className="space-y-3">
                    <h3 className="font-display m-0 text-xl font-extrabold">
                      Sources by claim
                    </h3>
                    <p className="m-0 text-sm text-muted">
                      At most three sources per claim, ranked. The strongest
                      opposing source is shown as a steelman. Everything else
                      folds under More.
                    </p>
                    {data.research.claim_dossiers.map((d) => (
                      <ClaimResearchDossierView
                        key={d.claim_ref}
                        dossier={d}
                      />
                    ))}
                  </section>
                ) : null}
                <section className="space-y-3 rounded-[20px] bg-white p-5">
                  <h3 className="font-display text-xl font-extrabold">
                    Tonight&apos;s findings
                  </h3>
                  {!data.research?.findings?.length ? (
                    <p className="text-sm text-muted">
                      No research findings yet. Nightly research posts at most
                      three cards here with Cruxy&apos;s judgment.
                    </p>
                  ) : (
                    data.research.findings.map((f) => (
                      <FindingCard
                        key={f.id}
                        point={f.point}
                        whyItMatters={f.why_it_matters}
                        quote={f.quote}
                        link={f.link}
                        verified={f.verified}
                        needsCheck={f.needs_check}
                        citation={f.citation}
                        openAccess={f.open_access}
                      />
                    ))
                  )}
                </section>
                <section className="rounded-[20px] bg-white p-5">
                  <h3 className="font-display text-xl font-extrabold">
                    Likely opposing positions
                  </h3>
                  <p className="mt-1 text-sm text-muted">
                    What other universities are most likely to bring, for
                    commenter prep.
                  </p>
                  <div className="mt-3 space-y-3">
                    {brain.opposing_positions.length === 0 ? (
                      <p className="text-sm text-muted">None yet.</p>
                    ) : (
                      brain.opposing_positions.map((o) => (
                        <article
                          key={o.id}
                          className="rounded-[14px] bg-[#F7F8FA] p-3.5"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-display text-base font-extrabold">
                              {o.title}
                            </h4>
                            <OriginTag label={o.origin} />
                          </div>
                          <p className="mt-2 text-sm">
                            <span className="text-muted">Strongest: </span>
                            {o.strongest_support}
                          </p>
                          <p className="mt-1 text-sm">
                            <span className="text-muted">Weak point: </span>
                            {o.weak_point}
                          </p>
                          <ul className="mt-2 list-disc pl-5 text-xs text-muted">
                            {o.commentary_angles.map((a) => (
                              <li key={a}>{a}</li>
                            ))}
                          </ul>
                        </article>
                      ))
                    )}
                  </div>
                </section>

                <section className="rounded-[20px] bg-white p-5">
                  <h3 className="font-display text-xl font-extrabold">
                    Consistency and change the facts
                  </h3>
                  {brain.consistency_flags.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">
                      No cross-case clashes flagged for this case yet.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {brain.consistency_flags.map((f) => (
                        <li
                          key={f.id}
                          className="rounded-xl border border-cardinal/20 bg-cardinal/5 p-3 text-sm"
                        >
                          {f.note}
                        </li>
                      ))}
                    </ul>
                  )}
                  {brain.change_the_facts.length ? (
                    <ul className="mt-3 space-y-2">
                      {brain.change_the_facts.map((c) => (
                        <li
                          key={c.id}
                          className="rounded-xl bg-gold/10 px-3 py-2 text-sm"
                        >
                          <p className="font-medium">{c.fact}</p>
                          <p className="text-xs text-muted">{c.why_flips}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted">
                      No change-the-facts flips listed yet.
                    </p>
                  )}
                </section>

                <section className="rounded-[20px] bg-white p-5">
                  <h3 className="font-display text-xl font-extrabold">
                    History
                  </h3>
                  {brain.history.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">No history yet.</p>
                  ) : (
                    <ul className="mt-2 max-h-80 space-y-2 overflow-y-auto">
                      {brain.history.slice(0, 40).map((h) => (
                        <li
                          key={h.id}
                          className="rounded-xl bg-[#F7F8FA] px-3 py-2 text-xs"
                        >
                          <p className="font-mono text-muted">
                            {new Date(h.at).toLocaleString()}
                            <span className="ml-2 rounded bg-white px-1.5 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wide text-[#3B404A]">
                              {h.action}
                            </span>
                          </p>
                          {h.reason ? (
                            <p className="mt-1">Reason: {h.reason}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            ) : null}
          </div>

          <aside className="flex flex-[1_1_340px] flex-col gap-4">
            <section
              aria-labelledby="queue-heading"
              className="flex flex-col gap-3.5 rounded-[20px] bg-white p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2
                  id="queue-heading"
                  className="font-display m-0 text-[22px] font-extrabold"
                >
                  Suggestions
                </h2>
                <span className="font-display text-[22px] font-extrabold text-cardinal">
                  {pending.length}
                </span>
              </div>
              <p className="m-0 text-[13px] leading-snug text-muted">
                New evidence, Cruxy&apos;s questions, counter-arguments, and
                Inspired by another team. Nothing changes the Brief until you
                accept
                {briefMode === "own_doc"
                  ? ". In Our own doc mode, accept adds a checklist item."
                  : "."}
              </p>

              {pending.length === 0 ? (
                <p className="text-sm leading-snug text-muted">
                  Nothing waiting. Ideas from practice, research, the reading
                  room and Inspired-by edits will show up here.
                </p>
              ) : (
                pending.map((p, i) => {
                  const peers = brain.peer_decisions_by_idea[p.idea_key] ?? [];
                  const researchLink =
                    p.origin === "research" && p.origin_ref?.includes("|")
                      ? p.origin_ref.split("|").slice(1).join("|")
                      : null;
                  const sources = (p.origin_ref ?? "")
                    .split(/[,;]/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .filter((s) => !s.startsWith("http"));
                  return (
                    <article
                      key={p.id}
                      className={cn(
                        "flex flex-col gap-2.5",
                        i < pending.length - 1
                          ? "border-b border-[#ECEEF1] pb-3.5"
                          : "",
                      )}
                    >
                      <OriginTag
                        label={originLabel(
                          p,
                          teams,
                          Boolean(data.canSeeAllTeams),
                        )}
                      />
                      <p className="m-0 text-[15px] font-medium leading-snug">
                        {p.text}
                      </p>
                      {researchLink ? (
                        <a
                          href={researchLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-cardinal underline"
                        >
                          Full source
                        </a>
                      ) : null}
                      {sources.length && p.origin !== "transcript" ? (
                        <div className="flex flex-wrap gap-1.5">
                          {sources.map((s) => (
                            <span
                              key={s}
                              className="inline-flex rounded-md bg-paper px-2 py-0.5 font-mono text-[12px] font-medium text-[#3B404A]"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {p.cruxy_note ? (
                        <span className="text-[13px] font-semibold text-[#C62828]">
                          {p.cruxy_note}
                        </span>
                      ) : null}

                      {p.origin === "inspired_by_team" &&
                      !p.socratic_answered ? (
                        <div className="rounded-xl border border-gold/50 bg-gold/10 p-3">
                          <p className="text-[12px] font-bold uppercase tracking-wide text-ink">
                            Cruxy asks first
                          </p>
                          <p className="mt-1 text-sm leading-snug">
                            {p.socratic_question}
                          </p>
                          {canEdit ? (
                            <button
                              type="button"
                              disabled={busy}
                              className="mt-2 rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-white"
                              onClick={() =>
                                void api("/api/case-brain/proposals", {
                                  method: "PATCH",
                                  body: JSON.stringify({
                                    proposalId: p.id,
                                    action: "socratic_answered",
                                  }),
                                })
                              }
                            >
                              I&apos;ve thought it through
                            </button>
                          ) : null}
                        </div>
                      ) : null}

                      {canEdit &&
                      (p.origin !== "inspired_by_team" ||
                        p.socratic_answered) ? (
                        <>
                          <label
                            htmlFor={`reason-${p.id}`}
                            className="text-[13px] font-semibold"
                          >
                            Why? One line, then tick to keep or cross to drop
                          </label>
                          <input
                            id={`reason-${p.id}`}
                            placeholder="One line on why"
                            className="h-[42px] rounded-[10px] border border-mist px-3 text-sm"
                            value={reasonDrafts[`prop:${p.id}`] ?? ""}
                            onChange={(e) =>
                              setReasonDrafts((d) => ({
                                ...d,
                                [`prop:${p.id}`]: e.target.value,
                              }))
                            }
                          />
                          {editingId === p.id ? (
                            <input
                              placeholder="Revised text"
                              className="h-[42px] rounded-[10px] border border-mist px-3 text-sm"
                              value={editDrafts[p.id] ?? p.text}
                              onChange={(e) =>
                                setEditDrafts((d) => ({
                                  ...d,
                                  [p.id]: e.target.value,
                                }))
                              }
                            />
                          ) : null}
                          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                            <button
                              type="button"
                              disabled={busy}
                              aria-label={
                                briefMode === "own_doc"
                                  ? "Add to checklist"
                                  : "Accept"
                              }
                              className="flex h-[42px] items-center justify-center gap-1.5 rounded-xl border border-mist bg-white text-sm font-semibold"
                              onClick={() => void decide(p.id, "accept")}
                            >
                              <span aria-hidden className="text-lg text-[#1F7A4D]">✓</span>
                              {briefMode === "own_doc" ? "To-do" : null}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              aria-label="Reject"
                              className="flex h-[42px] items-center justify-center gap-1.5 rounded-xl border border-mist bg-white text-sm font-semibold"
                              onClick={() => void decide(p.id, "reject")}
                            >
                              <span aria-hidden className="text-lg text-cardinal">✗</span>
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              className="flex h-[42px] items-center justify-center rounded-xl border border-mist bg-white px-3.5 text-sm font-semibold"
                              onClick={() => {
                                if (editingId !== p.id) {
                                  setEditingId(p.id);
                                  setEditDrafts((d) => ({
                                    ...d,
                                    [p.id]: d[p.id] ?? p.text,
                                  }));
                                  return;
                                }
                                void decide(p.id, "edit");
                              }}
                            >
                              {editingId === p.id ? "Save edit" : "Edit"}
                            </button>
                          </div>
                        </>
                      ) : null}

                      {peers.length > 0 ? (
                        <span className="text-[13px] text-muted">
                          {peers.map((d, di) => {
                            const colour =
                              TEAM_COLOUR[d.team_name] ?? "#5A606B";
                            const mark =
                              d.verdict === "accept"
                                ? "✅"
                                : d.verdict === "reject"
                                  ? "❌"
                                  : "✎";
                            return (
                              <span key={d.id}>
                                {di > 0 ? (
                                  <span className="mx-1 text-muted">,</span>
                                ) : null}
                                <span
                                  className="font-bold"
                                  style={{ color: colour }}
                                >
                                  {d.team_name} {mark}
                                </span>{" "}
                                {personName(data.people, d.person_id)}:{" "}
                                {d.reason}
                              </span>
                            );
                          })}
                          {!peers.some((d) => d.team_name === "Team 2") ? (
                            <>
                              <span className="mx-1 text-muted">,</span>
                              <span
                                className="font-bold"
                                style={{ color: "var(--crux-team-2)" }}
                              >
                                Team 2
                              </span>{" "}
                              hasn&apos;t decided
                            </>
                          ) : null}
                        </span>
                      ) : null}
                    </article>
                  );
                })
              )}
            </section>

            <ResearchCoverage
              brain={brain}
              research={data.research ?? null}
            />
          </aside>
        </div>
      )}

      {viewer.teamId !== brain.team_id && !compare ? (
        <p className="text-xs text-muted">
          Read-only view of another team&apos;s brain. Switch to{" "}
          {teams.find((t) => t.id === viewer.teamId)?.name ?? "your team"} to
          decide.
        </p>
      ) : null}
    </div>
  );
}

function ResearchCoverage({
  brain,
  research,
}: {
  brain: CaseBrainSnapshot;
  research?: ResearchPayload | null;
}) {
  const fromResearch =
    research?.findings?.length
      ? coverageFromFindings({
          claimCount: brain.claims.length,
          findings: research.findings,
        })
      : null;

  const rows =
    fromResearch ??
    brain.claims.slice(0, 2).map((node, i) => {
      const cells = [0, 1, 2].map((j) => {
        const s = node.supports[j];
        if (!s) return "empty" as const;
        if (s.backings.length === 0) return "gap" as const;
        return "full" as const;
      });
      const vs =
        node.counterclaims.length > 0 &&
        node.counterclaims.every((c) => c.concede && c.distinguish && c.rebut)
          ? ("full" as const)
          : node.counterclaims.length > 0
            ? ("half" as const)
            : ("gap" as const);
      return { label: `C${i + 1}`, cells: [...cells, vs] };
    });

  const closed = Math.min(
    rows.flatMap((r) => r.cells).filter((c) => c === "full" || c === "half")
      .length,
    Math.max(rows.length * 4, 1),
  );
  const total = Math.max(rows.length * 4, 1);
  const openGaps = research?.gaps?.length ?? 0;

  return (
    <section
      aria-labelledby="cov"
      className="flex flex-col gap-3 rounded-[20px] bg-white p-5"
    >
      <h2 id="cov" className="font-display m-0 text-xl font-extrabold">
        Research coverage
      </h2>
      <div className="grid grid-cols-[56px_repeat(4,minmax(0,1fr))] items-center gap-2 text-[12px] font-semibold text-muted">
        <span />
        <span>S1</span>
        <span>S2</span>
        <span>S3</span>
        <span>vs</span>
        {rows.map((r) => (
          <CoverageRow key={r.label} label={r.label} cells={r.cells} />
        ))}
      </div>
      <span className="text-[13px] leading-snug text-[#3B404A]">
        {closed} of {total} gaps closed with verified sources.
        {openGaps
          ? ` Cruxy is still searching ${openGaps} open gap${openGaps === 1 ? "" : "s"}.`
          : ""}
      </span>
    </section>
  );
}

function CoverageRow({
  label,
  cells,
}: {
  label: string;
  cells: Array<"full" | "half" | "gap" | "empty">;
}) {
  return (
    <>
      <span>{label}</span>
      {cells.map((c, i) => (
        <span
          key={`${label}-${i}`}
          className={cn(
            "h-4 w-4 rounded-full",
            c === "full" && "bg-ink",
            c === "half" &&
              "bg-[linear-gradient(90deg,#111318_50%,#E3E5E9_50%)]",
            c === "gap" && "box-border border-2 border-[#C62828] bg-transparent",
            c === "empty" && "bg-mist",
          )}
        />
      ))}
    </>
  );
}

function ComparePanel({
  caseId,
  teams,
}: {
  caseId: string;
  teams: Team[];
}) {
  const [snaps, setSnaps] = useState<
    { team: Team; claims: string[] }[] | null
  >(null);

  useEffect(() => {
    void (async () => {
      const rows = await Promise.all(
        teams.map(async (t) => {
          const res = await fetch(
            `/api/case-brain/${caseId}?teamId=${encodeURIComponent(t.id)}`,
          );
          const json = (await res.json()) as Payload;
          return {
            team: t,
            claims: (json.brain?.claims ?? []).map((n) => n.claim.text),
          };
        }),
      );
      setSnaps(rows);
    })();
  }, [caseId, teams]);

  if (!snaps) {
    return <p className="text-sm text-muted">Loading compare…</p>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {snaps.map((s) => (
        <section
          key={s.team.id}
          className="rounded-[20px] bg-white p-5"
          style={{ borderTop: `4px solid ${TEAM_COLOUR[s.team.name] ?? "#111"}` }}
        >
          <h3 className="font-display text-lg font-extrabold">{s.team.name}</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
            {s.claims.length ? (
              s.claims.map((c) => <li key={c.slice(0, 24)}>{c}</li>)
            ) : (
              <li className="text-muted">No claims yet</li>
            )}
          </ol>
        </section>
      ))}
    </div>
  );
}
