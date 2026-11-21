/**
 * Case brain domain service (sample-data path).
 * Decisions require a reason; accept/edit fans out Inspired-by proposals.
 */
import { createHash, randomUUID } from "crypto";
import {
  analystNoteForProposal,
  draftChangeTheFacts,
  draftOpposingPositions,
  socraticQuestionForInspiredBy,
} from "@/lib/case-brain/analyst";
import { findConsistencyFlags } from "@/lib/case-brain/consistency";
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
import {
  readStore,
  updateStore,
  type SampleStore,
} from "@/lib/db/sample-store";
import { nowIso } from "@/lib/utils";

function ideaKeyFromText(text: string): string {
  return createHash("sha256")
    .update(text.trim().toLowerCase().replace(/\s+/g, " "))
    .digest("hex")
    .slice(0, 24);
}

function pushHistory(
  store: SampleStore,
  entry: Omit<ItemHistoryEntry, "id" | "at"> & { at?: string },
) {
  store.item_history.unshift({
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
  });
}

function claimNodesFor(
  store: SampleStore,
  teamId: string,
  caseId: string,
): ClaimMapNode[] {
  const claims = store.claims
    .filter((c) => c.team_id === teamId && c.case_id === caseId)
    .sort((a, b) => a.ord - b.ord);
  return claims.map((claim) => {
    const supports = store.supports
      .filter((s) => s.claim_id === claim.id)
      .sort((a, b) => a.ord - b.ord)
      .map((support) => ({
        support,
        backings: store.backings.filter((b) => b.support_id === support.id),
      }));
    const counterclaims = store.counterclaims.filter(
      (cc) =>
        cc.team_id === teamId &&
        cc.case_id === caseId &&
        (cc.claim_id === claim.id || cc.claim_id === null),
    );
    return { claim, supports, counterclaims };
  });
}

export async function listCasesForBrain() {
  const store = await readStore();
  return store.cases.filter((c) => c.active).sort((a, b) => a.number - b.number);
}

export async function getCaseBrain(
  teamId: string,
  caseId: string,
): Promise<CaseBrainSnapshot> {
  const store = await readStore();
  const nodes = claimNodesFor(store, teamId, caseId);
  const truth_items = store.truth_items.filter(
    (t) => t.team_id === teamId && t.case_id === caseId,
  );
  const proposals = store.proposals
    .filter((p) => p.team_id === teamId && p.case_id === caseId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const decisions_by_proposal: Record<string, Decision[]> = {};
  for (const p of proposals) {
    decisions_by_proposal[p.id] = store.decisions.filter(
      (d) => d.proposal_id === p.id,
    );
  }

  const peer_decisions_by_idea: CaseBrainSnapshot["peer_decisions_by_idea"] =
    {};
  const ideaKeys = new Set(proposals.map((p) => p.idea_key));
  for (const key of ideaKeys) {
    const peers = store.proposals.filter(
      (p) => p.idea_key === key && p.team_id !== teamId,
    );
    const rows: CaseBrainSnapshot["peer_decisions_by_idea"][string] = [];
    for (const peer of peers) {
      const team = store.teams.find((t) => t.id === peer.team_id);
      for (const d of store.decisions.filter((x) => x.proposal_id === peer.id)) {
        rows.push({
          ...d,
          team_name: team?.name ?? "Team",
          proposal_text: peer.text,
        });
      }
    }
    peer_decisions_by_idea[key] = rows;
  }

  const principles = store.team_principles.filter((p) => p.team_id === teamId);
  const consistency_flags = findConsistencyFlags(teamId, principles).filter(
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
    case_roles: store.case_roles.filter(
      (r) => r.team_id === teamId && r.case_id === caseId,
    ),
    opposing_positions: store.opposing_positions.filter(
      (o) => o.case_id === caseId,
    ),
    history: store.item_history.filter(
      (h) =>
        h.case_id === caseId &&
        (h.team_id === teamId || h.team_id === null),
    ),
    principles: principles.filter((p) => p.case_id === caseId),
    change_the_facts: store.change_the_facts.filter(
      (c) => c.team_id === teamId && c.case_id === caseId,
    ),
    consistency_flags,
    robustness: computeRobustness(nodes, truth_items),
  };
}

export async function ensureClaimMapShell(input: {
  teamId: string;
  caseId: string;
  personId: string | null;
}): Promise<ClaimMapNode[]> {
  const store = await readStore();
  const existing = claimNodesFor(store, input.teamId, input.caseId);
  if (existing.length >= 2) return existing;

  await updateStore((s) => {
    const still = claimNodesFor(s, input.teamId, input.caseId);
    if (still.length >= 2) return;
    const now = nowIso();
    for (let i = still.length; i < 2; i++) {
      const claim: Claim = {
        id: randomUUID(),
        team_id: input.teamId,
        case_id: input.caseId,
        text: `Claim ${i + 1} (edit me)`,
        logic_line: "Because S1, S2 and S3, therefore the claim.",
        ord: i,
        citation_ids: [],
        created_at: now,
        created_by: input.personId,
        updated_at: now,
      };
      s.claims.push(claim);
      for (let j = 0; j < 3; j++) {
        const support: Support = {
          id: randomUUID(),
          claim_id: claim.id,
          team_id: input.teamId,
          case_id: input.caseId,
          text: `Support ${j + 1}`,
          logic_line: null,
          ord: j,
          citation_ids: [],
          created_at: now,
          created_by: input.personId,
          updated_at: now,
        };
        s.supports.push(support);
        const backing: Backing = {
          id: randomUUID(),
          support_id: support.id,
          team_id: input.teamId,
          case_id: input.caseId,
          kind: "case_fact",
          text: "Backing from case set (add page)",
          citation_ids: [],
          created_at: now,
          created_by: input.personId,
          updated_at: now,
        };
        s.backings.push(backing);
      }
      const cc: Counterclaim = {
        id: randomUUID(),
        team_id: input.teamId,
        case_id: input.caseId,
        claim_id: claim.id,
        text: "Likely counterclaim",
        concede: "Concede: …",
        distinguish: "Distinguish: …",
        rebut: "Rebut: …",
        citation_ids: [],
        created_at: now,
        created_by: input.personId,
        updated_at: now,
      };
      s.counterclaims.push(cc);
      pushHistory(s, {
        target_kind: "claim",
        target_id: claim.id,
        team_id: input.teamId,
        case_id: input.caseId,
        person_id: input.personId,
        action: "claim_shell_created",
        before: null,
        after: { text: claim.text },
        reason: "Scaffold claim map",
      });
    }
  });

  return claimNodesFor(await readStore(), input.teamId, input.caseId);
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

  let claim: Claim | undefined;
  await updateStore((s) => {
    claim = s.claims.find((c) => c.id === input.claimId);
    if (!claim || claim.team_id !== input.teamId) return;
    const before = { text: claim.text, logic_line: claim.logic_line };
    if (input.text !== undefined) claim.text = input.text;
    if (input.logic_line !== undefined) claim.logic_line = input.logic_line;
    claim.updated_at = nowIso();
    pushHistory(s, {
      target_kind: "claim",
      target_id: claim.id,
      team_id: claim.team_id,
      case_id: claim.case_id,
      person_id: input.personId,
      action: "claim_edited",
      before,
      after: { text: claim.text, logic_line: claim.logic_line },
      reason,
    });
  });

  if (!claim || claim.team_id !== input.teamId) {
    return { ok: false, error: "Claim not found for your team." };
  }

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

  let support: Support | undefined;
  await updateStore((s) => {
    support = s.supports.find((x) => x.id === input.supportId);
    if (!support || support.team_id !== input.teamId) return;
    const before = { text: support.text };
    if (input.text !== undefined) support.text = input.text;
    support.updated_at = nowIso();
    pushHistory(s, {
      target_kind: "support",
      target_id: support.id,
      team_id: support.team_id,
      case_id: support.case_id,
      person_id: input.personId,
      action: "support_edited",
      before,
      after: { text: support.text },
      reason,
    });
  });

  if (!support || support.team_id !== input.teamId) {
    return { ok: false, error: "Support not found for your team." };
  }

  await fanOutInspiredBy({
    fromTeamId: input.teamId,
    caseId: support.case_id,
    text: support.text,
    kind: "support_edit",
    personId: input.personId,
    originRef: support.id,
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

  let cc: Counterclaim | undefined;
  await updateStore((s) => {
    cc = s.counterclaims.find((x) => x.id === input.counterclaimId);
    if (!cc || cc.team_id !== input.teamId) return;
    const before = {
      text: cc.text,
      concede: cc.concede,
      distinguish: cc.distinguish,
      rebut: cc.rebut,
    };
    if (input.text !== undefined) cc.text = input.text;
    if (input.concede !== undefined) cc.concede = input.concede;
    if (input.distinguish !== undefined) cc.distinguish = input.distinguish;
    if (input.rebut !== undefined) cc.rebut = input.rebut;
    cc.updated_at = nowIso();
    pushHistory(s, {
      target_kind: "counterclaim",
      target_id: cc.id,
      team_id: cc.team_id,
      case_id: cc.case_id,
      person_id: input.personId,
      action: "counterclaim_edited",
      before,
      after: {
        text: cc.text,
        concede: cc.concede,
        distinguish: cc.distinguish,
        rebut: cc.rebut,
      },
      reason,
    });
  });

  if (!cc || cc.team_id !== input.teamId) {
    return { ok: false, error: "Counterclaim not found for your team." };
  }
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

  let backing: Backing | undefined;
  await updateStore((s) => {
    backing = s.backings.find((x) => x.id === input.backingId);
    if (!backing || backing.team_id !== input.teamId) return;
    const before = { text: backing.text, kind: backing.kind };
    if (input.text !== undefined) backing.text = input.text;
    if (input.kind !== undefined) backing.kind = input.kind;
    backing.updated_at = nowIso();
    pushHistory(s, {
      target_kind: "backing",
      target_id: backing.id,
      team_id: backing.team_id,
      case_id: backing.case_id,
      person_id: input.personId,
      action: "backing_edited",
      before,
      after: { text: backing.text, kind: backing.kind },
      reason,
    });
  });

  if (!backing || backing.team_id !== input.teamId) {
    return { ok: false, error: "Backing not found for your team." };
  }
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
  const store = await readStore();
  const teamTruth = store.truth_items.filter(
    (t) => t.team_id === input.teamId && t.case_id === input.caseId,
  );
  const note = await analystNoteForProposal({
    text: input.text,
    kind: input.kind ?? "other",
    citationIds: input.citationIds ?? [],
    teamTruth,
    personId: input.personId,
  });

  const origin = input.origin ?? "member";
  const claimSummaries = store.claims
    .filter((c) => c.team_id === input.teamId && c.case_id === input.caseId)
    .map((c) => c.text);
  const socratic =
    origin === "inspired_by_team"
      ? socraticQuestionForInspiredBy({
          proposalText: input.text,
          claimSummaries,
        })
      : null;

  const now = nowIso();
  const proposal: Proposal = {
    id: randomUUID(),
    team_id: input.teamId,
    case_id: input.caseId,
    idea_key: input.ideaKey ?? ideaKeyFromText(input.text),
    origin,
    origin_ref: input.originRef ?? null,
    inspired_from_team_id: input.inspiredFromTeamId ?? null,
    text: input.text.trim(),
    kind: input.kind ?? "other",
    cruxy_note: note,
    socratic_question: socratic,
    socratic_answered: origin !== "inspired_by_team",
    status: "pending",
    created_at: now,
    created_by: input.personId,
    updated_at: now,
  };

  await updateStore((s) => {
    s.proposals.push(proposal);
    pushHistory(s, {
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
  const store = await readStore();
  const otherTeams = store.teams.filter((t) => t.id !== input.fromTeamId);
  const key = input.ideaKey ?? ideaKeyFromText(input.text);
  const fromTeam = store.teams.find((t) => t.id === input.fromTeamId);

  for (const team of otherTeams) {
    // Skip if an identical pending inspired proposal already exists
    const exists = store.proposals.some(
      (p) =>
        p.team_id === team.id &&
        p.case_id === input.caseId &&
        p.idea_key === key &&
        p.status === "pending" &&
        p.origin === "inspired_by_team",
    );
    if (exists) continue;

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

export async function markSocraticAnswered(input: {
  proposalId: string;
  teamId: string;
  personId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let found = false;
  await updateStore((s) => {
    const p = s.proposals.find((x) => x.id === input.proposalId);
    if (!p || p.team_id !== input.teamId) return;
    p.socratic_answered = true;
    p.updated_at = nowIso();
    found = true;
    pushHistory(s, {
      target_kind: "proposal",
      target_id: p.id,
      team_id: p.team_id,
      case_id: p.case_id,
      person_id: input.personId,
      action: "socratic_answered",
      before: { socratic_answered: false },
      after: { socratic_answered: true },
      reason: null,
    });
  });
  if (!found) return { ok: false, error: "Proposal not found." };
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

  const store = await readStore();
  const proposal = store.proposals.find((p) => p.id === input.proposalId);
  if (!proposal || proposal.team_id !== input.teamId) {
    return { ok: false, error: "Proposal not found for your team." };
  }
  if (proposal.status !== "pending") {
    return { ok: false, error: "Proposal already decided." };
  }
  if (
    proposal.origin === "inspired_by_team" &&
    !proposal.socratic_answered
  ) {
    return {
      ok: false,
      error: "Answer Cruxy's Socratic question before deciding on Inspired-by.",
    };
  }

  const now = nowIso();
  const decision: Decision = {
    id: randomUUID(),
    proposal_id: proposal.id,
    person_id: input.personId,
    team_id: input.teamId,
    verdict: input.verdict,
    reason,
    edited_text:
      input.verdict === "edit" ? (input.editedText ?? null)?.trim() || null : null,
    created_at: now,
    created_by: input.personId,
  };

  let acceptedText = proposal.text;
  await updateStore((s) => {
    const p = s.proposals.find((x) => x.id === input.proposalId)!;
    p.status =
      input.verdict === "accept"
        ? "accepted"
        : input.verdict === "reject"
          ? "rejected"
          : "edited";
    p.updated_at = now;
    if (input.verdict === "edit" && decision.edited_text) {
      p.text = decision.edited_text;
      acceptedText = decision.edited_text;
    }
    s.decisions.push(decision);
    pushHistory(s, {
      target_kind: "decision",
      target_id: decision.id,
      team_id: input.teamId,
      case_id: p.case_id,
      person_id: input.personId,
      action: `decision_${input.verdict}`,
      before: { status: "pending", text: proposal.text },
      after: {
        status: p.status,
        text: p.text,
        reason,
        edited_text: decision.edited_text,
      },
      reason,
    });

    if (input.verdict === "accept" || input.verdict === "edit") {
      const kind: TruthKind =
        p.kind === "fact" ||
        p.kind === "quote" ||
        p.kind === "example" ||
        p.kind === "framework"
          ? p.kind
          : "fact";
      const truth: TruthItem = {
        id: randomUUID(),
        team_id: input.teamId,
        case_id: p.case_id,
        kind,
        text: acceptedText,
        citation_ids: [],
        status: "accepted",
        created_at: now,
        created_by: input.personId,
        updated_at: now,
      };
      s.truth_items.push(truth);
      pushHistory(s, {
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
    }
  });

  if (input.verdict === "accept" || input.verdict === "edit") {
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
  let role!: CaseRole;
  await updateStore((s) => {
    s.case_roles = s.case_roles.filter(
      (r) =>
        !(
          r.team_id === input.teamId &&
          r.case_id === input.caseId &&
          r.role === input.role
        ),
    );
    role = {
      id: randomUUID(),
      team_id: input.teamId,
      case_id: input.caseId,
      person_id: input.personId,
      role: input.role,
      created_at: nowIso(),
      created_by: input.actorId,
    };
    s.case_roles.push(role);
    pushHistory(s, {
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
  let row!: TeamPrinciple;
  await updateStore((s) => {
    const existing = s.team_principles.find(
      (p) =>
        p.team_id === input.teamId &&
        p.case_id === input.caseId &&
        (input.claimId
          ? p.claim_id === input.claimId
          : p.claim_id === null),
    );
    if (existing) {
      existing.principle = input.principle.trim();
      row = existing;
    } else {
      row = {
        id: randomUUID(),
        team_id: input.teamId,
        case_id: input.caseId,
        principle: input.principle.trim(),
        claim_id: input.claimId ?? null,
        created_at: nowIso(),
        created_by: input.personId,
      };
      s.team_principles.push(row);
    }
  });
  return row;
}

export async function ensureOpposingPositions(input: {
  caseId: string;
  personId?: string | null;
}): Promise<OpposingPosition[]> {
  const store = await readStore();
  const existing = store.opposing_positions.filter(
    (o) => o.case_id === input.caseId,
  );
  if (existing.length >= 3) return existing;

  const caseRow = store.cases.find((c) => c.id === input.caseId);
  if (!caseRow) return existing;

  const drafts = await draftOpposingPositions({
    caseTitle: caseRow.title,
    caseNumber: caseRow.number,
    personId: input.personId,
  });

  const created: OpposingPosition[] = [];
  await updateStore((s) => {
    if (s.opposing_positions.filter((o) => o.case_id === input.caseId).length >= 3) {
      return;
    }
    for (const d of drafts) {
      const row: OpposingPosition = {
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
      };
      s.opposing_positions.push(row);
      created.push(row);
      pushHistory(s, {
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
  });

  return (await readStore()).opposing_positions.filter(
    (o) => o.case_id === input.caseId,
  );
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
  const row: OpposingPosition = {
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
  };
  await updateStore((s) => {
    s.opposing_positions.push(row);
    pushHistory(s, {
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
  });
  return row;
}

export async function ensureChangeTheFacts(input: {
  teamId: string;
  caseId: string;
  claimId: string;
  personId?: string | null;
}): Promise<ChangeTheFactsItem[]> {
  const store = await readStore();
  const existing = store.change_the_facts.filter(
    (c) =>
      c.team_id === input.teamId &&
      c.case_id === input.caseId &&
      c.claim_id === input.claimId,
  );
  if (existing.length > 0) return existing;

  const claim = store.claims.find((c) => c.id === input.claimId);
  if (!claim) return [];

  const drafts = await draftChangeTheFacts({
    claimText: claim.text,
    personId: input.personId,
  });

  await updateStore((s) => {
    if (
      s.change_the_facts.some(
        (c) =>
          c.team_id === input.teamId &&
          c.case_id === input.caseId &&
          c.claim_id === input.claimId,
      )
    ) {
      return;
    }
    for (const d of drafts) {
      s.change_the_facts.push({
        id: randomUUID(),
        team_id: input.teamId,
        case_id: input.caseId,
        claim_id: input.claimId,
        fact: d.fact,
        why_flips: d.why_flips,
        prepared_answer: null,
        created_at: nowIso(),
        created_by: input.personId ?? null,
      });
    }
  });

  return (await readStore()).change_the_facts.filter(
    (c) =>
      c.team_id === input.teamId &&
      c.case_id === input.caseId &&
      c.claim_id === input.claimId,
  );
}

export async function getHistoryForTarget(targetId: string) {
  const store = await readStore();
  return store.item_history.filter((h) => h.target_id === targetId);
}

export function originLabel(
  proposal: Proposal,
  teams: { id: string; name: string }[],
): string {
  if (proposal.origin === "inspired_by_team") {
    const t = teams.find((x) => x.id === proposal.inspired_from_team_id);
    return t ? `Inspired by ${t.name}` : "Inspired by Team";
  }
  if (proposal.origin === "research") return "Cruxy research";
  if (proposal.origin === "transcript") return "Practice transcript";
  if (proposal.origin === "reading") return "Reading room";
  return "Team member";
}
