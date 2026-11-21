import "server-only";
import { randomUUID } from "crypto";
import {
  analystNoteForProposal,
  draftChangeTheFacts,
  draftOpposingPositions,
  socraticQuestionForInspiredBy,
} from "@/lib/case-brain/analyst";
import { findConsistencyFlags } from "@/lib/case-brain/consistency";
import { ideaKeyFromText } from "@/lib/case-brain/idea-key";
import { computeRobustness } from "@/lib/case-brain/robustness";
import type {
  Backing,
  CaseBrainSnapshot,
  CaseRole,
  CaseRoleKind,
  ChangeTheFactsItem,
  Claim,
  ClaimMapNode,
  Counterclaim,
  Decision,
  DecisionVerdict,
  ItemHistoryEntry,
  OpposingPosition,
  Proposal,
  ProposalOrigin,
  Support,
  TeamPrinciple,
  TruthItem,
  TruthKind,
} from "@/lib/case-brain/types";
import { logActivity } from "@/lib/db/repository";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import type { CaseRow } from "@/lib/types";
import { nowIso } from "@/lib/utils";

type Row = Record<string, unknown>;

function unwrap<T>(res: {
  data: T | null;
  error: { message: string } | null;
}): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

function check(res: { error: { message: string } | null }) {
  if (res.error) throw new Error(res.error.message);
}

function withCitations<T extends Row>(row: T): T & { citation_ids: string[] } {
  return { ...row, citation_ids: (row.citation_ids as string[] | null) ?? [] };
}

function toClaim(r: Row): Claim {
  return withCitations(r) as unknown as Claim;
}
function toSupport(r: Row): Support {
  return withCitations(r) as unknown as Support;
}
function toBacking(r: Row): Backing {
  return withCitations(r) as unknown as Backing;
}
function toCounterclaim(r: Row): Counterclaim {
  return withCitations(r) as unknown as Counterclaim;
}
function toTruth(r: Row): TruthItem {
  return withCitations(r) as unknown as TruthItem;
}
function toProposal(r: Row): Proposal {
  return {
    ...r,
    origin: (r.origin as ProposalOrigin | null) ?? "member",
    kind: (r.kind as Proposal["kind"] | null) ?? "other",
    citation_ids: (r.citation_ids as string[] | null) ?? [],
    socratic_answered: r.socratic_answered !== false,
  } as unknown as Proposal;
}
function toOpposing(r: Row): OpposingPosition {
  const angles = (r.commentary_angles as string[] | null) ?? [];
  return {
    ...r,
    commentary_angles: [angles[0] ?? "", angles[1] ?? ""],
  } as unknown as OpposingPosition;
}

async function pushHistory(
  entry: Omit<ItemHistoryEntry, "id" | "at"> & { at?: string },
) {
  const db = getServiceSupabase();
  check(
    await db.from("item_history").insert({
      id: randomUUID(),
      at: entry.at ?? nowIso(),
      target_kind: entry.target_kind,
      target_id: entry.target_id,
      team_id: entry.team_id,
      case_id: entry.case_id,
      person_id: entry.person_id,
      action: entry.action,
      before: entry.before,
      after: entry.after,
      reason: entry.reason,
    }),
  );
}

function assembleNodes(
  teamId: string,
  caseId: string,
  claims: Claim[],
  supports: Support[],
  backings: Backing[],
  counterclaims: Counterclaim[],
): ClaimMapNode[] {
  return [...claims]
    .sort((a, b) => a.ord - b.ord)
    .map((claim) => ({
      claim,
      supports: supports
        .filter((s) => s.claim_id === claim.id)
        .sort((a, b) => a.ord - b.ord)
        .map((support) => ({
          support,
          backings: backings.filter((b) => b.support_id === support.id),
        })),
      counterclaims: counterclaims.filter(
        (cc) =>
          cc.team_id === teamId &&
          cc.case_id === caseId &&
          (cc.claim_id === claim.id || cc.claim_id === null),
      ),
    }));
}

async function loadClaimNodes(
  teamId: string,
  caseId: string,
): Promise<ClaimMapNode[]> {
  const db = getServiceSupabase();
  const [claims, supports, backings, counterclaims] = await Promise.all([
    db.from("claims").select("*").eq("team_id", teamId).eq("case_id", caseId),
    db.from("supports").select("*").eq("team_id", teamId).eq("case_id", caseId),
    db
      .from("backings")
      .select("*")
      .eq("team_id", teamId)
      .eq("case_id", caseId)
      .order("created_at", { ascending: true }),
    db
      .from("counterclaims")
      .select("*")
      .eq("team_id", teamId)
      .eq("case_id", caseId),
  ]);
  return assembleNodes(
    teamId,
    caseId,
    (unwrap(claims) as Row[]).map(toClaim),
    (unwrap(supports) as Row[]).map(toSupport),
    (unwrap(backings) as Row[]).map(toBacking),
    (unwrap(counterclaims) as Row[]).map(toCounterclaim),
  );
}

export async function listCasesForBrain(): Promise<CaseRow[]> {
  const db = getServiceSupabase();
  const rows = unwrap(
    await db
      .from("cases")
      .select("*")
      .eq("active", true)
      .order("number", { ascending: true }),
  ) as CaseRow[];
  return rows;
}

export async function getCaseBrain(
  teamId: string,
  caseId: string,
): Promise<CaseBrainSnapshot> {
  const db = getServiceSupabase();
  const nodes = await loadClaimNodes(teamId, caseId);

  const [truthRes, proposalsRes, rolesRes, opposingRes, historyRes, principlesRes, ctfRes] =
    await Promise.all([
      db.from("truth_items").select("*").eq("team_id", teamId).eq("case_id", caseId),
      db
        .from("proposals")
        .select("*")
        .eq("team_id", teamId)
        .eq("case_id", caseId)
        .order("created_at", { ascending: false }),
      db.from("case_roles").select("*").eq("team_id", teamId).eq("case_id", caseId),
      db.from("opposing_positions").select("*").eq("case_id", caseId),
      db
        .from("item_history")
        .select("*")
        .eq("case_id", caseId)
        .or(`team_id.eq.${teamId},team_id.is.null`)
        .order("at", { ascending: false }),
      db.from("team_principles").select("*").eq("team_id", teamId),
      db
        .from("change_the_facts")
        .select("*")
        .eq("team_id", teamId)
        .eq("case_id", caseId),
    ]);

  const truth_items = (unwrap(truthRes) as Row[]).map(toTruth);
  const proposals = (unwrap(proposalsRes) as Row[]).map(toProposal);
  const allPrinciples = unwrap(principlesRes) as TeamPrinciple[];

  const proposalIds = proposals.map((p) => p.id);
  const ideaKeys = [...new Set(proposals.map((p) => p.idea_key))];

  const decisions_by_proposal: Record<string, Decision[]> = {};
  for (const p of proposals) decisions_by_proposal[p.id] = [];
  if (proposalIds.length > 0) {
    const decisions = unwrap(
      await db
        .from("decisions")
        .select("*")
        .in("proposal_id", proposalIds)
        .order("created_at", { ascending: true }),
    ) as Decision[];
    for (const d of decisions) decisions_by_proposal[d.proposal_id]?.push(d);
  }

  const peer_decisions_by_idea: CaseBrainSnapshot["peer_decisions_by_idea"] = {};
  for (const key of ideaKeys) peer_decisions_by_idea[key] = [];
  if (ideaKeys.length > 0) {
    const peers = (
      unwrap(
        await db
          .from("proposals")
          .select("id, team_id, idea_key, text")
          .in("idea_key", ideaKeys)
          .neq("team_id", teamId),
      ) as Array<{ id: string; team_id: string; idea_key: string; text: string }>
    );
    if (peers.length > 0) {
      const [peerDecisions, teams] = await Promise.all([
        db
          .from("decisions")
          .select("*")
          .in(
            "proposal_id",
            peers.map((p) => p.id),
          ),
        db.from("teams").select("id, name"),
      ]);
      const teamNames = new Map(
        (unwrap(teams) as Array<{ id: string; name: string }>).map((t) => [
          t.id,
          t.name,
        ]),
      );
      const peerById = new Map(peers.map((p) => [p.id, p]));
      for (const peer of peers) {
        for (const d of unwrap(peerDecisions) as Decision[]) {
          if (d.proposal_id !== peer.id) continue;
          peer_decisions_by_idea[peerById.get(peer.id)!.idea_key].push({
            ...d,
            team_name: teamNames.get(peer.team_id) ?? "Team",
            proposal_text: peer.text,
          });
        }
      }
    }
  }

  const consistency_flags = findConsistencyFlags(teamId, allPrinciples).filter(
    (f) => f.case_id_a === caseId || f.case_id_b === caseId,
  );

  return {
    case_id: caseId,
    team_id: teamId,
    claims: nodes,
    truth_items,
    proposals,
    decisions_by_proposal,
    peer_decisions_by_idea,
    case_roles: unwrap(rolesRes) as CaseRole[],
    opposing_positions: (unwrap(opposingRes) as Row[]).map(toOpposing),
    history: unwrap(historyRes) as ItemHistoryEntry[],
    principles: allPrinciples.filter((p) => p.case_id === caseId),
    change_the_facts: unwrap(ctfRes) as ChangeTheFactsItem[],
    consistency_flags,
    robustness: computeRobustness(nodes, truth_items),
  };
}

export async function ensureClaimMapShell(input: {
  teamId: string;
  caseId: string;
  personId: string | null;
}): Promise<ClaimMapNode[]> {
  const db = getServiceSupabase();
  const existing = await loadClaimNodes(input.teamId, input.caseId);
  if (existing.length >= 2) return existing;

  const now = nowIso();
  const claims: Row[] = [];
  const supports: Row[] = [];
  const backings: Row[] = [];
  const counterclaims: Row[] = [];
  const histories: Array<Parameters<typeof pushHistory>[0]> = [];

  for (let i = existing.length; i < 2; i++) {
    const claimId = randomUUID();
    const text = `Claim ${i + 1} (edit me)`;
    claims.push({
      id: claimId,
      team_id: input.teamId,
      case_id: input.caseId,
      text,
      logic_line: "Because S1, S2 and S3, therefore the claim.",
      ord: i,
      citation_ids: [],
      created_at: now,
      created_by: input.personId,
      updated_at: now,
    });
    for (let j = 0; j < 3; j++) {
      const supportId = randomUUID();
      supports.push({
        id: supportId,
        claim_id: claimId,
        team_id: input.teamId,
        case_id: input.caseId,
        text: `Support ${j + 1}`,
        logic_line: null,
        ord: j,
        citation_ids: [],
        created_at: now,
        created_by: input.personId,
        updated_at: now,
      });
      backings.push({
        id: randomUUID(),
        support_id: supportId,
        team_id: input.teamId,
        case_id: input.caseId,
        kind: "case_fact",
        text: "Backing from case set (add page)",
        citation_ids: [],
        created_at: now,
        created_by: input.personId,
        updated_at: now,
      });
    }
    counterclaims.push({
      id: randomUUID(),
      team_id: input.teamId,
      case_id: input.caseId,
      claim_id: claimId,
      text: "Likely counterclaim",
      concede: "Concede: …",
      distinguish: "Distinguish: …",
      rebut: "Rebut: …",
      citation_ids: [],
      created_at: now,
      created_by: input.personId,
      updated_at: now,
    });
    histories.push({
      target_kind: "claim",
      target_id: claimId,
      team_id: input.teamId,
      case_id: input.caseId,
      person_id: input.personId,
      action: "claim_shell_created",
      before: null,
      after: { text },
      reason: "Scaffold claim map",
    });
  }

  // Another request may have scaffolded the map while we prepared rows.
  const stillMissing = await loadClaimNodes(input.teamId, input.caseId);
  if (stillMissing.length >= 2) return stillMissing;

  check(await db.from("claims").insert(claims));
  check(await db.from("supports").insert(supports));
  check(await db.from("backings").insert(backings));
  check(await db.from("counterclaims").insert(counterclaims));
  for (const h of histories) await pushHistory(h);

  return loadClaimNodes(input.teamId, input.caseId);
}

export async function updateClaim(input: {
  claimId: string;
  personId: string;
  teamId: string;
  text?: string;
  logic_line?: string | null;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "A one-line reason is required." };

  const db = getServiceSupabase();
  const found = unwrap(
    await db.from("claims").select("*").eq("id", input.claimId).maybeSingle(),
  ) as Row | null;
  if (!found || found.team_id !== input.teamId) {
    return { ok: false, error: "Claim not found for your team." };
  }
  const before = toClaim(found);

  const patch: Row = { updated_at: nowIso() };
  if (input.text !== undefined) patch.text = input.text;
  if (input.logic_line !== undefined) patch.logic_line = input.logic_line;
  const claim = toClaim(
    unwrap(
      await db
        .from("claims")
        .update(patch)
        .eq("id", input.claimId)
        .select("*")
        .single(),
    ) as Row,
  );

  await pushHistory({
    target_kind: "claim",
    target_id: claim.id,
    team_id: claim.team_id,
    case_id: claim.case_id,
    person_id: input.personId,
    action: "claim_edited",
    before: { text: before.text, logic_line: before.logic_line },
    after: { text: claim.text, logic_line: claim.logic_line },
    reason,
  });

  await fanOutInspiredBy({
    fromTeamId: input.teamId,
    caseId: claim.case_id,
    text: claim.text,
    kind: "claim_edit",
    personId: input.personId,
    originRef: claim.id,
  });

  await logActivity({
    person_id: input.personId,
    action: "claim_edited",
    target: claim.id,
    meta: { reason },
  });

  return { ok: true };
}

export async function updateSupport(input: {
  supportId: string;
  personId: string;
  teamId: string;
  text?: string;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "A one-line reason is required." };

  const db = getServiceSupabase();
  const found = unwrap(
    await db.from("supports").select("*").eq("id", input.supportId).maybeSingle(),
  ) as Row | null;
  if (!found || found.team_id !== input.teamId) {
    return { ok: false, error: "Support not found for your team." };
  }
  const before = toSupport(found);

  const patch: Row = { updated_at: nowIso() };
  if (input.text !== undefined) patch.text = input.text;
  const support = toSupport(
    unwrap(
      await db
        .from("supports")
        .update(patch)
        .eq("id", input.supportId)
        .select("*")
        .single(),
    ) as Row,
  );

  await pushHistory({
    target_kind: "support",
    target_id: support.id,
    team_id: support.team_id,
    case_id: support.case_id,
    person_id: input.personId,
    action: "support_edited",
    before: { text: before.text },
    after: { text: support.text },
    reason,
  });

  await fanOutInspiredBy({
    fromTeamId: input.teamId,
    caseId: support.case_id,
    text: support.text,
    kind: "support_edit",
    personId: input.personId,
    originRef: support.id,
  });

  await logActivity({
    person_id: input.personId,
    action: "support_edited",
    target: support.id,
    meta: { reason },
  });

  return { ok: true };
}

export async function updateCounterclaim(input: {
  counterclaimId: string;
  personId: string;
  teamId: string;
  text?: string;
  concede?: string | null;
  distinguish?: string | null;
  rebut?: string | null;
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "A one-line reason is required." };

  const db = getServiceSupabase();
  const found = unwrap(
    await db
      .from("counterclaims")
      .select("*")
      .eq("id", input.counterclaimId)
      .maybeSingle(),
  ) as Row | null;
  if (!found || found.team_id !== input.teamId) {
    return { ok: false, error: "Counterclaim not found for your team." };
  }
  const before = toCounterclaim(found);

  const patch: Row = { updated_at: nowIso() };
  if (input.text !== undefined) patch.text = input.text;
  if (input.concede !== undefined) patch.concede = input.concede;
  if (input.distinguish !== undefined) patch.distinguish = input.distinguish;
  if (input.rebut !== undefined) patch.rebut = input.rebut;
  const cc = toCounterclaim(
    unwrap(
      await db
        .from("counterclaims")
        .update(patch)
        .eq("id", input.counterclaimId)
        .select("*")
        .single(),
    ) as Row,
  );

  await pushHistory({
    target_kind: "counterclaim",
    target_id: cc.id,
    team_id: cc.team_id,
    case_id: cc.case_id,
    person_id: input.personId,
    action: "counterclaim_edited",
    before: {
      text: before.text,
      concede: before.concede,
      distinguish: before.distinguish,
      rebut: before.rebut,
    },
    after: {
      text: cc.text,
      concede: cc.concede,
      distinguish: cc.distinguish,
      rebut: cc.rebut,
    },
    reason,
  });

  await logActivity({
    person_id: input.personId,
    action: "counterclaim_edited",
    target: cc.id,
    meta: { reason },
  });

  return { ok: true };
}

export async function updateBacking(input: {
  backingId: string;
  personId: string;
  teamId: string;
  text?: string;
  kind?: Backing["kind"];
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "A one-line reason is required." };

  const db = getServiceSupabase();
  const found = unwrap(
    await db.from("backings").select("*").eq("id", input.backingId).maybeSingle(),
  ) as Row | null;
  if (!found || found.team_id !== input.teamId) {
    return { ok: false, error: "Backing not found for your team." };
  }
  const before = toBacking(found);

  const patch: Row = { updated_at: nowIso() };
  if (input.text !== undefined) patch.text = input.text;
  if (input.kind !== undefined) patch.kind = input.kind;
  const backing = toBacking(
    unwrap(
      await db
        .from("backings")
        .update(patch)
        .eq("id", input.backingId)
        .select("*")
        .single(),
    ) as Row,
  );

  await pushHistory({
    target_kind: "backing",
    target_id: backing.id,
    team_id: backing.team_id,
    case_id: backing.case_id,
    person_id: input.personId,
    action: "backing_edited",
    before: { text: before.text, kind: before.kind },
    after: { text: backing.text, kind: backing.kind },
    reason,
  });

  await logActivity({
    person_id: input.personId,
    action: "backing_edited",
    target: backing.id,
    meta: { reason },
  });

  return { ok: true };
}

export async function createProposal(input: {
  teamId: string;
  caseId: string;
  personId: string;
  text: string;
  kind?: Proposal["kind"];
  origin?: ProposalOrigin;
  originRef?: string | null;
  inspiredFromTeamId?: string | null;
  citationIds?: string[];
  ideaKey?: string;
}): Promise<Proposal> {
  const db = getServiceSupabase();
  const [truthRes, claimsRes] = await Promise.all([
    db
      .from("truth_items")
      .select("*")
      .eq("team_id", input.teamId)
      .eq("case_id", input.caseId),
    db
      .from("claims")
      .select("text")
      .eq("team_id", input.teamId)
      .eq("case_id", input.caseId)
      .order("ord", { ascending: true }),
  ]);
  const teamTruth = (unwrap(truthRes) as Row[]).map(toTruth);
  const claimSummaries = (unwrap(claimsRes) as Array<{ text: string }>).map(
    (c) => c.text,
  );

  const note = await analystNoteForProposal({
    text: input.text,
    kind: input.kind ?? "other",
    citationIds: input.citationIds ?? [],
    teamTruth,
    personId: input.personId,
  });

  const origin = input.origin ?? "member";
  const socratic =
    origin === "inspired_by_team"
      ? socraticQuestionForInspiredBy({
          proposalText: input.text,
          claimSummaries,
        })
      : null;

  const now = nowIso();
  const row = {
    id: randomUUID(),
    team_id: input.teamId,
    case_id: input.caseId,
    idea_key: input.ideaKey ?? ideaKeyFromText(input.text),
    origin,
    origin_ref: input.originRef ?? null,
    inspired_from_team_id: input.inspiredFromTeamId ?? null,
    text: input.text.trim(),
    kind: input.kind ?? "other",
    citation_ids: input.citationIds ?? [],
    cruxy_note: note,
    socratic_question: socratic,
    socratic_answered: origin !== "inspired_by_team",
    status: "pending",
    created_at: now,
    created_by: input.personId,
    updated_at: now,
  };
  const proposal = toProposal(
    unwrap(await db.from("proposals").insert(row).select("*").single()) as Row,
  );

  await pushHistory({
    target_kind: "proposal",
    target_id: proposal.id,
    team_id: proposal.team_id,
    case_id: proposal.case_id,
    person_id: input.personId,
    action: "proposal_created",
    before: null,
    after: {
      text: proposal.text,
      origin: proposal.origin,
      cruxy_note: proposal.cruxy_note,
    },
    reason: null,
  });

  await logActivity({
    person_id: input.personId,
    action: "proposal_created",
    target: proposal.id,
    meta: { origin: proposal.origin, team_id: proposal.team_id },
  });

  return proposal;
}

async function fanOutInspiredBy(input: {
  fromTeamId: string;
  caseId: string;
  text: string;
  kind: Proposal["kind"];
  personId: string;
  originRef: string;
  ideaKey?: string;
}) {
  const db = getServiceSupabase();
  const teams = unwrap(await db.from("teams").select("id, name")) as Array<{
    id: string;
    name: string;
  }>;
  const otherTeams = teams.filter((t) => t.id !== input.fromTeamId);
  if (otherTeams.length === 0) return;
  const fromTeam = teams.find((t) => t.id === input.fromTeamId);
  const key = input.ideaKey ?? ideaKeyFromText(input.text);

  const pending = unwrap(
    await db
      .from("proposals")
      .select("team_id")
      .eq("case_id", input.caseId)
      .eq("idea_key", key)
      .eq("status", "pending")
      .eq("origin", "inspired_by_team")
      .in(
        "team_id",
        otherTeams.map((t) => t.id),
      ),
  ) as Array<{ team_id: string }>;
  const skip = new Set(pending.map((p) => p.team_id));

  for (const team of otherTeams) {
    if (skip.has(team.id)) continue;
    await createProposal({
      teamId: team.id,
      caseId: input.caseId,
      personId: input.personId,
      text: input.text,
      kind: input.kind,
      origin: "inspired_by_team",
      originRef: `${fromTeam?.name ?? "Team"}:${input.originRef}`,
      inspiredFromTeamId: input.fromTeamId,
      ideaKey: key,
    });
  }
}

export async function getProposalById(
  proposalId: string,
): Promise<Proposal | null> {
  const db = getServiceSupabase();
  const row = unwrap(
    await db.from("proposals").select("*").eq("id", proposalId).maybeSingle(),
  ) as Row | null;
  return row ? toProposal(row) : null;
}

export async function listDecisionsForProposal(
  proposalId: string,
): Promise<Decision[]> {
  const db = getServiceSupabase();
  return unwrap(
    await db
      .from("decisions")
      .select("*")
      .eq("proposal_id", proposalId)
      .order("created_at", { ascending: true }),
  ) as Decision[];
}

export async function markSocraticAnswered(input: {
  proposalId: string;
  teamId: string;
  personId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getServiceSupabase();
  const found = unwrap(
    await db
      .from("proposals")
      .select("*")
      .eq("id", input.proposalId)
      .eq("team_id", input.teamId)
      .maybeSingle(),
  ) as Row | null;
  if (!found) return { ok: false, error: "Proposal not found." };

  check(
    await db
      .from("proposals")
      .update({ socratic_answered: true, updated_at: nowIso() })
      .eq("id", input.proposalId),
  );
  await pushHistory({
    target_kind: "proposal",
    target_id: input.proposalId,
    team_id: input.teamId,
    case_id: found.case_id as string,
    person_id: input.personId,
    action: "socratic_answered",
    before: { socratic_answered: false },
    after: { socratic_answered: true },
    reason: null,
  });
  await logActivity({
    person_id: input.personId,
    action: "socratic_answered",
    target: input.proposalId,
    meta: { team_id: input.teamId },
  });
  return { ok: true };
}

export async function decideProposal(input: {
  proposalId: string;
  personId: string;
  teamId: string;
  verdict: DecisionVerdict;
  reason: string;
  editedText?: string | null;
}): Promise<{ ok: true; decision: Decision } | { ok: false; error: string }> {
  const reason = input.reason.trim();
  if (!reason) {
    return { ok: false, error: "A decision without a reason cannot be saved." };
  }
  if (input.verdict === "edit" && !input.editedText?.trim()) {
    return { ok: false, error: "Edit requires the revised text." };
  }

  const db = getServiceSupabase();
  const proposal = await getProposalById(input.proposalId);
  if (!proposal || proposal.team_id !== input.teamId) {
    return { ok: false, error: "Proposal not found for your team." };
  }
  if (proposal.status !== "pending") {
    return { ok: false, error: "Proposal already decided." };
  }
  if (proposal.origin === "inspired_by_team" && !proposal.socratic_answered) {
    return {
      ok: false,
      error: "Answer Cruxy's Socratic question before deciding on Inspired-by.",
    };
  }

  const now = nowIso();
  const editedText =
    input.verdict === "edit" ? (input.editedText ?? "").trim() || null : null;
  const status =
    input.verdict === "accept"
      ? "accepted"
      : input.verdict === "reject"
        ? "rejected"
        : "edited";
  const acceptedText = editedText ?? proposal.text;

  // Claim the pending proposal first so two decisions cannot both win.
  const claimed = unwrap(
    await db
      .from("proposals")
      .update({
        status,
        updated_at: now,
        ...(editedText ? { text: editedText } : {}),
      })
      .eq("id", proposal.id)
      .eq("status", "pending")
      .select("id"),
  ) as Array<{ id: string }>;
  if (claimed.length === 0) {
    return { ok: false, error: "Proposal already decided." };
  }

  let decision: Decision;
  try {
    decision = unwrap(
      await db
        .from("decisions")
        .insert({
          id: randomUUID(),
          proposal_id: proposal.id,
          person_id: input.personId,
          team_id: input.teamId,
          verdict: input.verdict,
          reason,
          edited_text: editedText,
          created_at: now,
          created_by: input.personId,
        })
        .select("*")
        .single(),
    ) as Decision;
  } catch (err) {
    await db
      .from("proposals")
      .update({ status: "pending", text: proposal.text, updated_at: nowIso() })
      .eq("id", proposal.id);
    throw err;
  }

  await pushHistory({
    target_kind: "decision",
    target_id: decision.id,
    team_id: input.teamId,
    case_id: proposal.case_id,
    person_id: input.personId,
    action: `decision_${input.verdict}`,
    before: { status: "pending", text: proposal.text },
    after: {
      status,
      text: acceptedText,
      reason,
      edited_text: editedText,
    },
    reason,
  });

  if (input.verdict === "accept" || input.verdict === "edit") {
    const kind: TruthKind =
      proposal.kind === "fact" ||
      proposal.kind === "quote" ||
      proposal.kind === "example" ||
      proposal.kind === "framework"
        ? proposal.kind
        : "fact";
    const truth = toTruth(
      unwrap(
        await db
          .from("truth_items")
          .insert({
            id: randomUUID(),
            team_id: input.teamId,
            case_id: proposal.case_id,
            kind,
            text: acceptedText,
            citation_ids: [],
            status: "accepted",
            created_at: now,
            created_by: input.personId,
            updated_at: now,
          })
          .select("*")
          .single(),
      ) as Row,
    );
    await pushHistory({
      target_kind: "truth_item",
      target_id: truth.id,
      team_id: truth.team_id,
      case_id: truth.case_id,
      person_id: input.personId,
      action: "truth_accepted",
      before: null,
      after: { text: truth.text, kind: truth.kind },
      reason,
    });

    await fanOutInspiredBy({
      fromTeamId: input.teamId,
      caseId: proposal.case_id,
      text: acceptedText,
      kind: proposal.kind,
      personId: input.personId,
      originRef: proposal.id,
      ideaKey: proposal.idea_key,
    });
  }

  await logActivity({
    person_id: input.personId,
    action: `proposal_${input.verdict}`,
    target: proposal.id,
    meta: { reason, team_id: input.teamId },
  });

  return { ok: true, decision };
}

export async function setCaseRole(input: {
  teamId: string;
  caseId: string;
  personId: string;
  role: CaseRoleKind;
  actorId: string;
}): Promise<CaseRole> {
  const db = getServiceSupabase();
  const role = unwrap(
    await db
      .from("case_roles")
      .upsert(
        {
          team_id: input.teamId,
          case_id: input.caseId,
          person_id: input.personId,
          role: input.role,
          created_at: nowIso(),
          created_by: input.actorId,
        },
        { onConflict: "team_id,case_id,role" },
      )
      .select("*")
      .single(),
  ) as CaseRole;

  await pushHistory({
    target_kind: "case_role",
    target_id: role.id,
    team_id: input.teamId,
    case_id: input.caseId,
    person_id: input.actorId,
    action: "case_role_set",
    before: null,
    after: { role: input.role, person_id: input.personId },
    reason: null,
  });
  await logActivity({
    person_id: input.actorId,
    action: "case_role_set",
    target: role.id,
    meta: { role: input.role, person_id: input.personId },
  });
  return role;
}

export async function upsertPrinciple(input: {
  teamId: string;
  caseId: string;
  principle: string;
  claimId?: string | null;
  personId: string;
}): Promise<TeamPrinciple> {
  const db = getServiceSupabase();
  let query = db
    .from("team_principles")
    .select("*")
    .eq("team_id", input.teamId)
    .eq("case_id", input.caseId);
  query = input.claimId
    ? query.eq("claim_id", input.claimId)
    : query.is("claim_id", null);
  const existing = unwrap(await query.limit(1).maybeSingle()) as TeamPrinciple | null;

  const principle = input.principle.trim();
  let row: TeamPrinciple;
  if (existing) {
    row = unwrap(
      await db
        .from("team_principles")
        .update({ principle })
        .eq("id", existing.id)
        .select("*")
        .single(),
    ) as TeamPrinciple;
  } else {
    row = unwrap(
      await db
        .from("team_principles")
        .insert({
          id: randomUUID(),
          team_id: input.teamId,
          case_id: input.caseId,
          principle,
          claim_id: input.claimId ?? null,
          created_at: nowIso(),
          created_by: input.personId,
        })
        .select("*")
        .single(),
    ) as TeamPrinciple;
  }

  await logActivity({
    person_id: input.personId,
    action: "principle_saved",
    target: row.id,
    meta: { team_id: input.teamId, case_id: input.caseId },
  });
  return row;
}

async function listOpposing(caseId: string): Promise<OpposingPosition[]> {
  const db = getServiceSupabase();
  const rows = unwrap(
    await db
      .from("opposing_positions")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: true }),
  ) as Row[];
  return rows.map(toOpposing);
}

export async function ensureOpposingPositions(input: {
  caseId: string;
  personId?: string | null;
}): Promise<OpposingPosition[]> {
  const db = getServiceSupabase();
  const existing = await listOpposing(input.caseId);
  if (existing.length >= 3) return existing;

  const caseRow = unwrap(
    await db.from("cases").select("*").eq("id", input.caseId).maybeSingle(),
  ) as CaseRow | null;
  if (!caseRow) return existing;

  const drafts = await draftOpposingPositions({
    caseTitle: caseRow.title,
    caseNumber: caseRow.number,
    personId: input.personId,
  });

  if ((await listOpposing(input.caseId)).length >= 3) {
    return listOpposing(input.caseId);
  }

  const rows = drafts.map((d) => ({
    id: randomUUID(),
    case_id: input.caseId,
    title: d.title,
    strongest_support: d.strongest_support,
    weak_point: d.weak_point,
    commentary_angles: d.commentary_angles,
    origin: "cruxy",
    added_by_team_id: null,
    created_at: nowIso(),
    created_by: input.personId ?? null,
  }));
  if (rows.length > 0) {
    check(await db.from("opposing_positions").insert(rows));
    for (const row of rows) {
      await pushHistory({
        target_kind: "opposing_position",
        target_id: row.id,
        team_id: null,
        case_id: input.caseId,
        person_id: input.personId ?? null,
        action: "opposing_seeded",
        before: null,
        after: { title: row.title },
        reason: null,
      });
    }
  }

  return listOpposing(input.caseId);
}

export async function addOpposingPosition(input: {
  caseId: string;
  teamId: string;
  personId: string;
  title: string;
  strongest_support: string;
  weak_point: string;
  commentary_angles: [string, string];
}): Promise<OpposingPosition> {
  const db = getServiceSupabase();
  const row = toOpposing(
    unwrap(
      await db
        .from("opposing_positions")
        .insert({
          id: randomUUID(),
          case_id: input.caseId,
          title: input.title.trim(),
          strongest_support: input.strongest_support.trim(),
          weak_point: input.weak_point.trim(),
          commentary_angles: input.commentary_angles,
          origin: "team",
          added_by_team_id: input.teamId,
          created_at: nowIso(),
          created_by: input.personId,
        })
        .select("*")
        .single(),
    ) as Row,
  );
  await pushHistory({
    target_kind: "opposing_position",
    target_id: row.id,
    team_id: input.teamId,
    case_id: input.caseId,
    person_id: input.personId,
    action: "opposing_added",
    before: null,
    after: { title: row.title },
    reason: null,
  });
  await logActivity({
    person_id: input.personId,
    action: "opposing_added",
    target: row.id,
    meta: { team_id: input.teamId, case_id: input.caseId },
  });
  return row;
}

async function listChangeTheFacts(input: {
  teamId: string;
  caseId: string;
  claimId: string;
}): Promise<ChangeTheFactsItem[]> {
  const db = getServiceSupabase();
  return unwrap(
    await db
      .from("change_the_facts")
      .select("*")
      .eq("team_id", input.teamId)
      .eq("case_id", input.caseId)
      .eq("claim_id", input.claimId)
      .order("created_at", { ascending: true }),
  ) as ChangeTheFactsItem[];
}

export async function ensureChangeTheFacts(input: {
  teamId: string;
  caseId: string;
  claimId: string;
  personId?: string | null;
}): Promise<ChangeTheFactsItem[]> {
  const db = getServiceSupabase();
  const existing = await listChangeTheFacts(input);
  if (existing.length > 0) return existing;

  const claim = unwrap(
    await db.from("claims").select("*").eq("id", input.claimId).maybeSingle(),
  ) as Row | null;
  if (!claim) return [];

  const drafts = await draftChangeTheFacts({
    claimText: claim.text as string,
    personId: input.personId,
  });

  if ((await listChangeTheFacts(input)).length > 0) {
    return listChangeTheFacts(input);
  }

  if (drafts.length > 0) {
    check(
      await db.from("change_the_facts").insert(
        drafts.map((d) => ({
          id: randomUUID(),
          team_id: input.teamId,
          case_id: input.caseId,
          claim_id: input.claimId,
          fact: d.fact,
          why_flips: d.why_flips,
          prepared_answer: null,
          created_at: nowIso(),
          created_by: input.personId ?? null,
        })),
      ),
    );
  }

  return listChangeTheFacts(input);
}

export async function getHistoryForTarget(
  targetId: string,
): Promise<ItemHistoryEntry[]> {
  const db = getServiceSupabase();
  return unwrap(
    await db
      .from("item_history")
      .select("*")
      .eq("target_id", targetId)
      .order("at", { ascending: false }),
  ) as ItemHistoryEntry[];
}
