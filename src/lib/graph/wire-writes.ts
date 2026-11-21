import "server-only";
import { recordEdge } from "@/lib/graph/recordEdge";
import type { ArgEdgeType } from "@/lib/graph/types";

/**
 * Fire-safe graph writes for live mutation paths.
 * Failures are logged via activity_log skip; callers should not fail the
 * primary write if the graph write throws (we catch here).
 */

async function safeRecord(
  input: Parameters<typeof recordEdge>[0],
): Promise<void> {
  try {
    await recordEdge(input);
  } catch {
    // Graph is additive; never break the primary write.
  }
}

function citesFromIds(opts: {
  from_kind: "claim" | "support" | "backing" | "counterclaim" | "truth_item" | "proposal";
  from_id: string;
  citation_ids: string[] | null | undefined;
  team_id: string;
  case_id: string;
  created_by?: string | null;
  source_kind: string;
  source_id?: string | null;
}): Promise<void>[] {
  const ids = opts.citation_ids ?? [];
  return ids.map((passageId) =>
    safeRecord({
      from_kind: opts.from_kind,
      from_id: opts.from_id,
      to_kind: "passage",
      to_id: passageId,
      type: "cites",
      weight: 1,
      source_kind: opts.source_kind,
      source_id: opts.source_id ?? opts.from_id,
      team_id: opts.team_id,
      case_id: opts.case_id,
      created_by: opts.created_by ?? null,
    }),
  );
}

/** Support row always supports its claim. */
export async function wireSupportLink(opts: {
  supportId: string;
  claimId: string;
  teamId: string;
  caseId: string;
  personId?: string | null;
  citationIds?: string[] | null;
}): Promise<void> {
  await safeRecord({
    from_kind: "support",
    from_id: opts.supportId,
    to_kind: "claim",
    to_id: opts.claimId,
    type: "supports",
    weight: 1,
    source_kind: "claim_map",
    source_id: opts.supportId,
    team_id: opts.teamId,
    case_id: opts.caseId,
    created_by: opts.personId ?? null,
  });
  await Promise.all(
    citesFromIds({
      from_kind: "support",
      from_id: opts.supportId,
      citation_ids: opts.citationIds,
      team_id: opts.teamId,
      case_id: opts.caseId,
      created_by: opts.personId,
      source_kind: "claim_map",
    }),
  );
}

/** Backing row supports its support. */
export async function wireBackingLink(opts: {
  backingId: string;
  supportId: string;
  teamId: string;
  caseId: string;
  personId?: string | null;
  citationIds?: string[] | null;
}): Promise<void> {
  await safeRecord({
    from_kind: "backing",
    from_id: opts.backingId,
    to_kind: "support",
    to_id: opts.supportId,
    type: "supports",
    weight: 1,
    source_kind: "claim_map",
    source_id: opts.backingId,
    team_id: opts.teamId,
    case_id: opts.caseId,
    created_by: opts.personId ?? null,
  });
  await Promise.all(
    citesFromIds({
      from_kind: "backing",
      from_id: opts.backingId,
      citation_ids: opts.citationIds,
      team_id: opts.teamId,
      case_id: opts.caseId,
      created_by: opts.personId,
      source_kind: "claim_map",
    }),
  );
}

/** Counterclaim attacks a claim; concede / distinguish / rebut when present. */
export async function wireCounterclaimLinks(opts: {
  counterclaimId: string;
  claimId: string | null;
  teamId: string;
  caseId: string;
  personId?: string | null;
  concede?: string | null;
  distinguish?: string | null;
  rebut?: string | null;
  citationIds?: string[] | null;
}): Promise<void> {
  if (opts.claimId) {
    await safeRecord({
      from_kind: "counterclaim",
      from_id: opts.counterclaimId,
      to_kind: "claim",
      to_id: opts.claimId,
      type: "attacks",
      weight: 1,
      source_kind: "claim_map",
      source_id: opts.counterclaimId,
      team_id: opts.teamId,
      case_id: opts.caseId,
      created_by: opts.personId ?? null,
    });
    const extras: Array<{ type: ArgEdgeType; present: boolean }> = [
      { type: "concedes", present: Boolean(opts.concede?.trim()) },
      { type: "distinguishes", present: Boolean(opts.distinguish?.trim()) },
      { type: "rebuts", present: Boolean(opts.rebut?.trim()) },
    ];
    for (const e of extras) {
      if (!e.present) continue;
      await safeRecord({
        from_kind: "counterclaim",
        from_id: opts.counterclaimId,
        to_kind: "claim",
        to_id: opts.claimId,
        type: e.type,
        weight: 1,
        source_kind: "claim_map",
        source_id: opts.counterclaimId,
        team_id: opts.teamId,
        case_id: opts.caseId,
        created_by: opts.personId ?? null,
      });
    }
  }
  await Promise.all(
    citesFromIds({
      from_kind: "counterclaim",
      from_id: opts.counterclaimId,
      citation_ids: opts.citationIds,
      team_id: opts.teamId,
      case_id: opts.caseId,
      created_by: opts.personId,
      source_kind: "claim_map",
    }),
  );
}

/** Claim edit: refresh citation edges. */
export async function wireClaimEdit(opts: {
  claimId: string;
  teamId: string;
  caseId: string;
  personId?: string | null;
  citationIds?: string[] | null;
}): Promise<void> {
  await Promise.all(
    citesFromIds({
      from_kind: "claim",
      from_id: opts.claimId,
      citation_ids: opts.citationIds,
      team_id: opts.teamId,
      case_id: opts.caseId,
      created_by: opts.personId,
      source_kind: "claim_map",
    }),
  );
}

/** Proposal created (inspired-by or otherwise). */
export async function wireProposalCreated(opts: {
  proposalId: string;
  teamId: string;
  caseId: string;
  personId?: string | null;
  inspiredFromTeamId?: string | null;
  origin?: string | null;
  citationIds?: string[] | null;
}): Promise<void> {
  if (opts.inspiredFromTeamId) {
    await safeRecord({
      from_kind: "proposal",
      from_id: opts.proposalId,
      to_kind: "team",
      to_id: opts.inspiredFromTeamId,
      type: "inspired_by",
      weight: 1,
      source_kind: "proposal",
      source_id: opts.proposalId,
      team_id: opts.teamId,
      case_id: opts.caseId,
      created_by: opts.personId ?? null,
    });
  }
  await Promise.all(
    citesFromIds({
      from_kind: "proposal",
      from_id: opts.proposalId,
      citation_ids: opts.citationIds,
      team_id: opts.teamId,
      case_id: opts.caseId,
      created_by: opts.personId,
      source_kind: "proposal",
    }),
  );
}

/** Accepting / editing a proposal into a Truth Source. */
export async function wireTruthAccepted(opts: {
  truthItemId: string;
  proposalId: string;
  teamId: string;
  caseId: string;
  personId?: string | null;
  citationIds?: string[] | null;
}): Promise<void> {
  await safeRecord({
    from_kind: "truth_item",
    from_id: opts.truthItemId,
    to_kind: "proposal",
    to_id: opts.proposalId,
    type: "supports",
    weight: 1,
    source_kind: "truth_source",
    source_id: opts.proposalId,
    team_id: opts.teamId,
    case_id: opts.caseId,
    created_by: opts.personId ?? null,
  });
  await Promise.all(
    citesFromIds({
      from_kind: "truth_item",
      from_id: opts.truthItemId,
      citation_ids: opts.citationIds,
      team_id: opts.teamId,
      case_id: opts.caseId,
      created_by: opts.personId,
      source_kind: "truth_source",
      source_id: opts.proposalId,
    }),
  );
}

/** Judge card moment: transcript line used in a round. */
export async function wireJudgeMoment(opts: {
  lineId: string;
  roundId: string;
  cardId: string;
  teamId?: string | null;
  caseId?: string | null;
  personId?: string | null;
  claimId?: string | null;
}): Promise<void> {
  await safeRecord({
    from_kind: "transcript_line",
    from_id: opts.lineId,
    to_kind: opts.claimId ? "claim" : "team",
    to_id: opts.claimId ?? opts.teamId ?? opts.lineId,
    type: "used_in_round",
    weight: 1,
    source_kind: "judge_card",
    source_id: opts.cardId,
    round_id: opts.roundId,
    line_id: opts.lineId,
    team_id: opts.teamId ?? null,
    case_id: opts.caseId ?? null,
    created_by: opts.personId ?? null,
  });
}

/** Feedback / judge comment tied to a transcript line. */
export async function wireFeedbackComment(opts: {
  feedbackId: string;
  lineId: string | null;
  roundId: string;
  personId: string;
  teamId?: string | null;
  caseId?: string | null;
  claimId?: string | null;
}): Promise<void> {
  if (!opts.lineId) return;
  await safeRecord({
    from_kind: "feedback_item",
    from_id: opts.feedbackId,
    to_kind: "transcript_line",
    to_id: opts.lineId,
    type: "cites",
    weight: 1,
    source_kind: "judge_comment",
    source_id: opts.feedbackId,
    round_id: opts.roundId,
    line_id: opts.lineId,
    team_id: opts.teamId ?? null,
    case_id: opts.caseId ?? null,
    created_by: opts.personId,
  });
  if (opts.claimId) {
    await safeRecord({
      from_kind: "feedback_item",
      from_id: opts.feedbackId,
      to_kind: "claim",
      to_id: opts.claimId,
      type: "attacks",
      weight: 0.5,
      source_kind: "judge_comment",
      source_id: opts.feedbackId,
      round_id: opts.roundId,
      line_id: opts.lineId,
      team_id: opts.teamId ?? null,
      case_id: opts.caseId ?? null,
      created_by: opts.personId,
    });
  }
}

/** Bank entry / transcript moment saved from practice. */
export async function wireBankMoment(opts: {
  bankEntryId: string;
  lineId: string | null;
  caseId: string | null;
  personId?: string | null;
  claimId?: string | null;
  teamId?: string | null;
}): Promise<void> {
  if (!opts.lineId) return;
  const toKind = opts.claimId ? "claim" : opts.teamId ? "team" : null;
  const toId = opts.claimId ?? opts.teamId;
  if (!toKind || !toId) return;
  await safeRecord({
    from_kind: "transcript_line",
    from_id: opts.lineId,
    to_kind: toKind,
    to_id: toId,
    type: "used_in_round",
    weight: 1,
    source_kind: "bank_entry",
    source_id: opts.bankEntryId,
    line_id: opts.lineId,
    case_id: opts.caseId,
    team_id: opts.teamId ?? null,
    created_by: opts.personId ?? null,
  });
}
