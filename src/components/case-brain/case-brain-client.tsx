"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import { CaseReadings } from "@/components/case/case-readings";
import { ExtraReadingSection } from "@/components/case/extra-reading-section";
import { IdeasOverTime } from "@/components/case/ideas-over-time";
import { OnePagerPanel } from "@/components/case/one-pager-panel";
import { ReadingResearchSection } from "@/components/case/reading-research-section";
import { SaveShareMenu } from "@/components/case/save-share-menu";
import { TheCaseTab } from "@/components/case/the-case-tab";
import { WorkingDocument } from "@/components/case/working-document";
import { OriginTag } from "@/components/case-brain/origin-tag";
import { suggestionKindFromOrigin } from "@/components/case-brain/team-brief-panel";
import { emitMood } from "@/components/cruxy/mood/bus";
import { OfflineCaseBanner } from "@/components/offline/offline-case-view";
import { coverageFromFindings } from "@/lib/cruxy/research-gaps";
import { Skeleton, SkeletonBlock } from "@/components/motion/skeleton";
import type { CaseHomePayload } from "@/lib/case-home/types";
import type {
  CaseBrainSnapshot,
  CaseRoleKind,
  DecisionVerdict,
} from "@/lib/case-brain/types";
import type { CaseRow, Team } from "@/lib/types";
import { cn } from "@/lib/utils";

type PrimaryTab = "reading" | "working" | "one_pager" | "more";

function resolveTabParam(raw: string | null): PrimaryTab {
  if (!raw) return "reading";
  if (
    raw === "reading" ||
    raw === "case" ||
    raw === "readings" ||
    raw === "research" ||
    raw === "truth"
  ) {
    return "reading";
  }
  if (raw === "working" || raw === "brief") return "working";
  if (raw === "one_pager" || raw === "one-pager" || raw === "map") {
    return "one_pager";
  }
  if (raw === "more" || raw === "ideas") return "more";
  if (raw === "flashcards" || raw === "questions") return "more";
  return "reading";
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
    // An id means nothing to a person; show when it came from instead.
    const looksLikeId = /[0-9a-f]{8}-[0-9a-f]{4}-/i.test(ref);
    if (ref.startsWith("From practice") && !looksLikeId) return ref;
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
  initialData = null,
  initialCaseHome = null,
}: {
  caseId: string;
  initialTeamId?: string;
  /** Server-rendered first paint; skips the empty skeleton on phones. */
  initialData?: Payload | null;
  initialCaseHome?: CaseHomePayload | null;
}) {
  const [data, setData] = useState<Payload | null>(initialData);
  const [teamId, setTeamId] = useState(
    initialData?.brain.team_id ?? initialTeamId ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({});
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAllQueue, setShowAllQueue] = useState(false);
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab");
  const focusFileId = searchParams.get("file");
  const [tab, setTab] = useState<PrimaryTab>(() => resolveTabParam(initialTab));

  // Keep the open tab in the address bar so a reload or shared link lands on it.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("tab") === tab) return;
      url.searchParams.set("tab", tab);
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      // ignore
    }
  }, [tab]);
  const [rolesOpen, setRolesOpen] = useState(false);
  const [compare, setCompare] = useState(false);
  const [caseHome, setCaseHome] = useState<CaseHomePayload | null>(
    initialCaseHome,
  );
  const [briefMode, setBriefMode] = useState<
    "own_doc" | "build_in_crux" | null
  >(null);
  /** Extra reading / research wait until the case text is on screen. */
  const [readingExtrasReady, setReadingExtrasReady] = useState(false);

  useEffect(() => {
    setTab(resolveTabParam(initialTab));
  }, [initialTab]);

  useEffect(() => {
    if (tab !== "reading") return;
    const id = window.setTimeout(() => setReadingExtrasReady(true), 50);
    return () => window.clearTimeout(id);
  }, [tab]);

  // Which team's case text is on screen; only a team switch clears it.
  const loadedTeamRef = useRef<string | null>(
    initialData?.brain.team_id ?? null,
  );

  const load = useCallback(
    async (tid?: string) => {
      setError(null);
      if (tid && loadedTeamRef.current && tid !== loadedTeamRef.current) {
        setCaseHome(null);
      }
      const q = tid ? `?teamId=${encodeURIComponent(tid)}` : "";
      // Kick case-home in parallel with the brain payload.
      const homePromise = fetch(`/api/case-home/${caseId}${q}`)
        .then(async (r) => {
          if (!r.ok) return null;
          return (await r.json()) as CaseHomePayload;
        })
        .catch(() => null);
      const res = await fetch(`/api/case-brain/${caseId}${q}`);
      const json = (await res.json()) as Payload & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Failed to load case brain");
        return;
      }
      setData(json);
      setTeamId(json.brain.team_id);
      loadedTeamRef.current = json.brain.team_id;
      const home = await homePromise;
      if (home) setCaseHome(home);
    },
    [caseId],
  );

  useEffect(() => {
    // SSR already filled the first paint; team switcher calls load() itself.
    if (initialData) return;
    void load(initialTeamId);
  }, [load, initialTeamId, initialData]);

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

  // Refresh case-home when the team switcher changes after the first load.
  useEffect(() => {
    if (!teamId || !caseId || tab !== "reading") return;
    if (caseHome) return;
    let cancelled = false;
    void (async () => {
      const q = `?teamId=${encodeURIComponent(teamId)}`;
      const res = await fetch(`/api/case-home/${caseId}${q}`);
      if (!res.ok || cancelled) return;
      const json = (await res.json()) as CaseHomePayload;
      if (!cancelled) setCaseHome(json);
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId, teamId, tab, caseHome]);

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
    o === "inspired_by_team"
      ? 0
      : o === "transcript"
        ? 1
        : o === "research"
          ? 2
          : 3;
  const pending = brain.proposals
    .filter((p) => p.status === "pending")
    .sort((a, b) => originRank(a.origin) - originRank(b.origin));
  const viewingTeam = teams.find((t) => t.id === brain.team_id);
  const crux = formatCrux(caseRow?.crux);
  const caseNum = String(caseRow?.number ?? "").padStart(2, "0");
  const lead1 = brain.case_roles.find((r) => r.role === "lead_1");
  const lead2 = brain.case_roles.find((r) => r.role === "lead_2");
  const counter = brain.case_roles.find((r) => r.role === "counter_arguer");

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


  // Ideas waiting on this case, shown inside the working document's one Suggestions rail.
  const proposalQueue = pending.map((p, i) => {
                    const peers =
                      brain.peer_decisions_by_idea[p.idea_key] ?? [];
                    const researchLink =
                      p.origin === "research" && p.origin_ref?.includes("|")
                        ? p.origin_ref.split("|").slice(1).join("|")
                        : null;
                    const sources = (p.origin_ref ?? "")
                      .split(/[,;]/)
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .filter((s) => !s.startsWith("http"))
                      // Internal ids are never shown; only named sources.
                      .filter(
                        (s) =>
                          !s.includes("|") &&
                          !/^(research|transcript|truth|session):/i.test(s) &&
                          !/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s),
                      );
                    return (
                      <article
                        key={p.id}
                        className={cn(
                          "flex flex-col gap-2 rounded-[14px] border border-[#E6E8EC] bg-white px-3.5 py-3",
                          i >= 3 && !showAllQueue ? "hidden" : "",
                        )}
                      >
                        <OriginTag
                          label={originLabel(
                            p,
                            teams,
                            Boolean(data.canSeeAllTeams),
                          )}
                        />
                        <p className="m-0 text-[14px] leading-snug text-ink">
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
                            <input
                              id={`reason-${p.id}`}
                              aria-label="Why keep or drop it? One line"
                              placeholder="Why? One line (optional)"
                              className="h-9 rounded-lg border border-mist bg-[#F7F8FA] px-2.5 text-[13px]"
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
                                className="h-9 rounded-lg border border-mist px-2.5 text-[13px]"
                                value={editDrafts[p.id] ?? p.text}
                                onChange={(e) =>
                                  setEditDrafts((d) => ({
                                    ...d,
                                    [p.id]: e.target.value,
                                  }))
                                }
                              />
                            ) : null}
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                aria-label={
                                  briefMode === "own_doc"
                                    ? "Add to checklist"
                                    : "Accept"
                                }
                                className="min-h-9 rounded-lg bg-ink px-3.5 text-xs font-semibold text-white disabled:opacity-60"
                                onClick={() => void decide(p.id, "accept")}
                              >
                                {briefMode === "own_doc" ? "Add to to-do" : "Keep"}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                aria-label="Reject"
                                className="min-h-9 rounded-lg border border-mist bg-white px-3 text-xs font-semibold disabled:opacity-60"
                                onClick={() => void decide(p.id, "reject")}
                              >
                                Drop
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                className="ml-auto text-xs font-semibold text-cardinal"
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
                  });

  return (
    <div className="flex flex-col gap-5 animate-fade-up">
      <OfflineCaseBanner caseId={caseId} />
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="flex items-end gap-5">
          <span className="font-display text-[120px] font-extrabold leading-[0.8] tracking-[-0.05em] text-cardinal">
            {caseNum}
          </span>
          <div className="flex max-w-[620px] flex-col gap-1.5">
            <span className="flex flex-wrap items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-muted">
              <span>Case</span>
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
            <div className="mt-2">
              <SaveShareMenu
                caseId={caseId}
                teamId={teamId || brain.team_id}
                canSaveDrive={canEdit}
                onePagerId={null}
              />
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
            className="inline-flex min-h-11 items-center font-semibold text-cardinal underline"
          >
            Change
          </button>
        ) : (
          <Link
            href="/team/roles"
            className="inline-flex min-h-11 items-center font-semibold text-cardinal underline"
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
                  className="min-h-11 rounded-[10px] border border-mist bg-[#F7F8FA] px-2 text-sm font-semibold text-ink disabled:opacity-60"
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
        role="tablist"
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
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 border-b-[3px] px-3.5 py-2.5 text-sm font-semibold",
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
              <div className="flex flex-col gap-8">
                {!caseHome ? (
                  <div className="flex flex-col gap-3" aria-busy>
                    <Skeleton className="h-8 w-56" />
                    <Skeleton className="h-48 w-full" rounded="lg" />
                    <SkeletonBlock lines={3} />
                  </div>
                ) : (
                  <TheCaseTab
                    caseId={caseId}
                    teamId={teamId || brain.team_id}
                    initial={caseHome}
                  />
                )}
                {readingExtrasReady ? (
                  <>
                    <ExtraReadingSection
                      caseId={caseId}
                      teamId={teamId || brain.team_id}
                      truthItems={brain.truth_items}
                      canEdit={canEdit}
                    />
                    {caseHome ? (
                      <CaseReadings
                        caseId={caseId}
                        teamId={teamId || brain.team_id}
                        focusFileId={focusFileId}
                        initial={caseHome}
                      />
                    ) : null}
                    <ReadingResearchSection
                      brain={brain}
                      research={data.research ?? null}
                    />
                  </>
                ) : (
                  <div className="flex flex-col gap-3" aria-busy>
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-24 w-full" rounded="lg" />
                  </div>
                )}
              </div>
            ) : null}

            {tab === "working" ? (
              <div className="flex flex-col gap-4">
                <WorkingDocument
                  caseId={caseId}
                  teamId={teamId || brain.team_id}
                  queue={{
                    count: pending.length,
                    node: (
                      <>
                        {proposalQueue}
                        {pending.length > 3 ? (
                          <button
                            type="button"
                            className="self-start text-xs font-semibold text-cardinal"
                            onClick={() => setShowAllQueue((v) => !v)}
                          >
                            {showAllQueue ? "Show fewer" : `Show all ${pending.length}`}
                          </button>
                        ) : null}
                      </>
                    ),
                  }}
                />
                <ResearchCoverage
                  brain={brain}
                  research={data.research ?? null}
                />
              </div>
            ) : null}

            {tab === "one_pager" ? (
              <div className="flex flex-col gap-3">
                <p className="m-0 text-sm text-muted">
                  Claim structure: claims, supports, counterclaim and reply.
                  Flashcards and questions are in{" "}
                  <Link
                    href="/practice"
                    className="inline-flex min-h-11 items-center font-semibold text-cardinal underline"
                  >
                    Practice
                  </Link>
                  .
                </p>
                <OnePagerPanel
                  caseId={caseId}
                  teamId={teamId || brain.team_id}
                  embedded
                />
              </div>
            ) : null}

            {tab === "more" ? (
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="font-display m-0 text-xl font-extrabold">
                    Ideas over time
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    How this case&apos;s ideas grew. Flashcards and questions
                    live in{" "}
                    <Link
                      href="/practice"
                      className="inline-flex min-h-11 items-center font-semibold text-cardinal underline"
                    >
                      Practice
                    </Link>
                    .
                  </p>
                </div>
                <IdeasOverTime
                  caseId={caseId}
                  teamId={teamId || brain.team_id}
                  initial={caseHome}
                />
              </div>
            ) : null}
          </div>


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
  const fromResearch = research?.findings?.length
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
            c === "gap" &&
              "box-border border-2 border-[#C62828] bg-transparent",
            c === "empty" && "bg-mist",
          )}
        />
      ))}
    </>
  );
}

type CompareSnap = {
  team: Team;
  claims: Array<{
    text: string;
    supports: string[];
    counter: string | null;
  }>;
  truthAccepted: number;
  pendingIdeas: number;
  mapVersion: number | null;
};

function ComparePanel({ caseId, teams }: { caseId: string; teams: Team[] }) {
  const [snaps, setSnaps] = useState<CompareSnap[] | null>(null);

  useEffect(() => {
    void (async () => {
      const rows = await Promise.all(
        teams.map(async (t) => {
          const res = await fetch(
            `/api/case-brain/${caseId}?teamId=${encodeURIComponent(t.id)}&lite=1`,
          );
          const json = (await res.json()) as Payload;
          const claims = (json.brain?.claims ?? []).map((n) => ({
            text: n.claim.text,
            supports: n.supports.map((s) => s.support.text).slice(0, 3),
            counter: n.counterclaims[0]?.text ?? null,
          }));
          return {
            team: t,
            claims,
            truthAccepted: json.meta?.truth_accepted ?? 0,
            pendingIdeas: json.meta?.truth_waiting ?? 0,
            mapVersion: json.meta?.map_version?.version ?? null,
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
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-muted">
        Side by side for coaches. Members never see this.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {snaps.map((s) => (
          <section
            key={s.team.id}
            className="rounded-[20px] bg-white p-5"
            style={{
              borderTop: `4px solid ${TEAM_COLOUR[s.team.name] ?? "#111"}`,
            }}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-display m-0 text-lg font-extrabold">
                {s.team.name}
              </h3>
              {s.mapVersion != null ? (
                <span className="rounded-md bg-ink px-2 py-0.5 text-[11px] font-semibold text-white">
                  Map v{s.mapVersion}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-[12px] text-muted">
              {s.truthAccepted} Evidence Library item
              {s.truthAccepted === 1 ? "" : "s"} accepted
              {s.pendingIdeas
                ? `, ${s.pendingIdeas} idea${s.pendingIdeas === 1 ? "" : "s"} waiting`
                : ""}
            </p>
            {s.claims.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No claims yet</p>
            ) : (
              <ol className="mt-3 list-decimal space-y-3 pl-5 text-sm">
                {s.claims.map((c) => (
                  <li key={c.text.slice(0, 32)}>
                    <p className="m-0 font-semibold">{c.text}</p>
                    {c.supports.length ? (
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[13px] text-[#3B404A]">
                        {c.supports.map((sup) => (
                          <li key={sup.slice(0, 24)}>{sup}</li>
                        ))}
                      </ul>
                    ) : null}
                    {c.counter ? (
                      <p className="m-0 mt-1 text-[13px] text-muted">
                        Counter: {c.counter}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
