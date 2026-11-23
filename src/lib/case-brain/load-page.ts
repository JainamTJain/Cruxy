import "server-only";

import {
  canSeeAllTeams,
  resolveVisibleTeamId,
} from "@/lib/auth/team-privacy";
import { requireMemberSession } from "@/lib/case-brain/auth";
import { ensureDemoProposalQueue } from "@/lib/case-brain/ensure-demo-queue";
import { ensureClaimMapVersion } from "@/lib/case-brain/ensure-map-version";
import {
  diffClaimMapBodies,
  previousClaimMapVersion,
} from "@/lib/case-brain/map-diff";
import {
  ensureChangeTheFacts,
  ensureClaimMapShell,
  ensureOpposingPositions,
  getCaseBrain,
} from "@/lib/case-brain/service";
import type { CaseBrainSnapshot } from "@/lib/case-brain/types";
import {
  listCases,
  listPeopleFull,
  listTeams,
} from "@/lib/db/repository";
import { listDeckOptInsForCase } from "@/lib/db/supabase/case-brain-extra";
import {
  listLibraryFiles,
  listResearchRuns,
} from "@/lib/db/library-repository";
import type {
  ClaimSourceDossier,
  ResearchBrief,
} from "@/lib/library/types";
import { cleanResearchForReaders } from "@/lib/library/research-display";
import { listFlashcards, listQuestions } from "@/lib/revision/repository";
import { opposingFromPrep } from "@/lib/seed/opposing";
import {
  getCurrentClaimMap,
  listClaimMapVersions,
  listConfirmations,
} from "@/lib/team/repository";
import type { CaseRow, Person, SessionPayload, Team } from "@/lib/types";
import { truthSourceForCase } from "@/lib/working-doc/start-all-from-truth";

export type CaseBrainResearchPayload = {
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
  claim_dossiers?: ClaimSourceDossier[] | null;
  brief?: ResearchBrief | null;
};

export type CaseBrainPagePayload = {
  case: CaseRow | null;
  teams: Team[];
  people: { id: string; name: string; team_id: string | null }[];
  brain: CaseBrainSnapshot;
  research: CaseBrainResearchPayload | null;
  canEdit: boolean;
  canSeeAllTeams: boolean;
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
    map_version: {
      id: string;
      version: number;
      change_summary: string;
      confirmed_by: string[];
      confirmed_count: number;
      team_size: number;
      viewer_confirmed: boolean;
      unconfirmed_names: string[];
      diff_lines: { path: string; before: string; after: string }[];
    } | null;
  };
};

type AuthOk = {
  ok: true;
  session: SessionPayload;
  teamId: string;
  person: Person;
};

/**
 * Full case page payload. Shared by the API route and the SSR page so a phone
 * gets HTML with content instead of an empty skeleton then a waterfall.
 */
export async function loadCaseBrainPage(opts: {
  caseId: string;
  requestedTeamId?: string | null;
  lite?: boolean;
  auth?: AuthOk;
}): Promise<
  | { ok: true; data: CaseBrainPagePayload }
  | { ok: false; status: number; error: string }
> {
  const authResult = opts.auth ?? (await requireMemberSession());
  if (!authResult.ok) {
    return {
      ok: false,
      status: authResult.status,
      error: authResult.error,
    };
  }
  const session = authResult.session;
  const me = authResult.person;
  const { teamId } = resolveVisibleTeamId({
    person: me,
    session,
    requested: opts.requestedTeamId ?? authResult.teamId,
  });
  if (!teamId) {
    return {
      ok: false,
      status: 403,
      error: "Case brain needs a team membership.",
    };
  }

  const seeAll = canSeeAllTeams(me, session);
  const lite = Boolean(opts.lite);
  const caseId = opts.caseId;
  const ownTeamId = authResult.teamId;

  if (!lite) {
    await Promise.all([
      ensureClaimMapShell({
        teamId,
        caseId,
        personId: session.personId,
      }),
      ensureOpposingPositions({
        caseId,
        personId: session.personId,
      }),
      ensureDemoProposalQueue({
        teamId,
        caseId,
        personId: session.personId,
      }),
    ]);
    if (teamId === ownTeamId) {
      await ensureClaimMapVersion({
        teamId,
        caseId,
        personId: session.personId,
      });
    }
  }

  let refreshed = await getCaseBrain(teamId, caseId);
  if (!lite) {
    const missingCtf = refreshed.claims.filter(
      (node) =>
        !refreshed.change_the_facts.some((c) => c.claim_id === node.claim.id),
    );
    if (missingCtf.length > 0) {
      await Promise.all(
        missingCtf.map((node) =>
          ensureChangeTheFacts({
            teamId,
            caseId,
            claimId: node.claim.id,
            personId: session.personId,
          }),
        ),
      );
      refreshed = await getCaseBrain(teamId, caseId);
    }
  }

  if (!seeAll) {
    refreshed = {
      ...refreshed,
      peer_decisions_by_idea: {},
      peer_claim_scores: {},
    };
  }

  const [
    teams,
    cases,
    peopleFull,
    flashcards,
    questions,
    mapVersion,
    versions,
    optIns,
    researchRuns,
    libraryFiles,
  ] = await Promise.all([
    listTeams(),
    listCases(),
    listPeopleFull(),
    lite ? Promise.resolve([]) : listFlashcards({ teamId, caseId }),
    lite ? Promise.resolve([]) : listQuestions({ caseId }),
    lite ? Promise.resolve(null) : getCurrentClaimMap(teamId, caseId),
    lite ? Promise.resolve([]) : listClaimMapVersions(teamId, caseId),
    lite ? Promise.resolve([]) : listDeckOptInsForCase(caseId),
    lite ? Promise.resolve([]) : listResearchRuns(12),
    lite ? Promise.resolve([]) : listLibraryFiles(),
  ]);
  const researchForCase = researchRuns.filter((r) => r.case_id === caseId);
  const latestResearch = researchForCase[0] ?? null;
  const caseRow = cases.find((c) => c.id === caseId) ?? null;

  if (caseRow && refreshed.opposing_positions.length > 1) {
    const supports = new Set(
      refreshed.opposing_positions.map((o) => o.strongest_support),
    );
    if (supports.size === 1) {
      const prep = truthSourceForCase(caseRow.number);
      if (prep) {
        const derived = opposingFromPrep(prep);
        const byTitle = new Map(derived.map((d) => [d.title.toLowerCase(), d]));
        refreshed = {
          ...refreshed,
          opposing_positions: refreshed.opposing_positions.map((o, i) => {
            const d = byTitle.get(o.title.toLowerCase()) ?? derived[i];
            return d && o.origin === "team"
              ? {
                  ...o,
                  strongest_support: d.strongest_support,
                  weak_point: d.weak_point,
                  commentary_angles: d.commentary_angles,
                }
              : o;
          }),
        };
      }
    }
  }

  const people = peopleFull.map((p) => ({
    id: p.id,
    name: p.name,
    team_id: p.team_id,
  }));
  const confirmations = mapVersion
    ? await listConfirmations(mapVersion.id)
    : [];

  const canEdit = teamId === ownTeamId || seeAll;
  const visibleTeams = seeAll ? teams : teams.filter((t) => t.id === teamId);
  const visiblePeople = seeAll
    ? people
    : people.filter((p) => p.team_id === teamId);
  const teamPeople = people.filter((p) => p.team_id === teamId);
  const confirmedIds = new Set(confirmations.map((c) => c.person_id));
  const unconfirmedNames = teamPeople
    .filter((p) => !confirmedIds.has(p.id))
    .map((p) => p.name);

  const prev = mapVersion
    ? previousClaimMapVersion(versions, mapVersion.id)
    : null;
  const diff_lines = mapVersion
    ? diffClaimMapBodies(prev?.body ?? null, mapVersion.body)
    : [];

  const leadIds = new Set(
    refreshed.case_roles
      .filter((r) => r.role === "lead_1" || r.role === "lead_2")
      .map((r) => r.person_id),
  );
  const alsoIds = new Set<string>();
  for (const o of optIns) {
    if (!o.assigned && !leadIds.has(o.person_id)) alsoIds.add(o.person_id);
  }
  for (const r of refreshed.case_roles) {
    if (!leadIds.has(r.person_id)) alsoIds.add(r.person_id);
  }
  const alsoStudying = [...alsoIds]
    .map((id) => people.find((p) => p.id === id)?.name)
    .filter((n): n is string => Boolean(n));

  const truthAccepted = refreshed.truth_items.filter(
    (t) => t.status === "accepted",
  ).length;
  const truthRejected = refreshed.truth_items.filter(
    (t) => t.status === "rejected",
  ).length;
  const waitingProposals = refreshed.proposals.filter(
    (p) => p.status === "pending",
  ).length;
  const readingCount = libraryFiles.filter(
    (f) =>
      f.case_ids.includes(caseId) ||
      (caseRow != null && f.case_numbers.includes(caseRow.number)),
  ).length;

  const research = latestResearch
    ? (() => {
        const readable = cleanResearchForReaders(latestResearch);
        return {
          id: latestResearch.id,
          stub: latestResearch.stub,
          created_at: latestResearch.created_at,
          gaps: latestResearch.gaps,
          findings: readable.findings,
          claim_dossiers: readable.claim_dossiers ?? null,
          brief: readable.brief ?? null,
        };
      })()
    : null;

  return {
    ok: true,
    data: {
      case: caseRow,
      teams: visibleTeams,
      people: visiblePeople,
      brain: refreshed,
      research,
      canEdit,
      canSeeAllTeams: seeAll,
      viewer: {
        personId: session.personId,
        teamId: ownTeamId,
        name: me.name ?? session.name,
      },
      meta: {
        truth_count: truthAccepted,
        truth_accepted: truthAccepted,
        truth_rejected: truthRejected,
        truth_waiting: waitingProposals,
        flashcard_count: flashcards.length,
        question_count: questions.filter((q) => q.status === "active").length,
        reading_count: readingCount,
        also_studying: alsoStudying,
        map_version: mapVersion
          ? {
              id: mapVersion.id,
              version: mapVersion.version,
              change_summary: mapVersion.change_summary,
              confirmed_by: confirmations.map((c) => c.person_id),
              confirmed_count: confirmations.length,
              team_size: Math.max(teamPeople.length, 1),
              viewer_confirmed: confirmations.some(
                (c) => c.person_id === session.personId,
              ),
              unconfirmed_names: unconfirmedNames,
              diff_lines,
            }
          : null,
      },
    },
  };
}
