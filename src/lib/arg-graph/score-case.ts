/**
 * Compute DF-QuAD robustness for every claim on a case (all teams).
 * Scores are shared: any team can read any team's claim scores for the case.
 */
import "server-only";

import {
  practiceRoundDateLabel,
  scoreClaimFromEdges,
} from "@/lib/arg-graph/df-quad";
import { synthesizeClaimMapEdges } from "@/lib/arg-graph/synthesize";
import type { ArgEdge, ClaimRobustnessScore } from "@/lib/arg-graph/types";
import type { ClaimMapNode } from "@/lib/case-brain/types";
import { getRoundById } from "@/lib/db/practice-repository";
import {
  listEdgesForCase,
  upsertClaimRobustnessScores,
} from "@/lib/db/supabase/arg-graph-extra";

async function datesForRounds(
  ids: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    ids.map(async (id) => {
      try {
        const round = await getRoundById(id);
        if (!round) return;
        const label = practiceRoundDateLabel({
          sessionDate: round.session.date,
          startedAt: round.started_at,
          createdAt: round.created_at,
        });
        if (label) out[id] = label;
      } catch {
        // A missing round still scores. The summary omits the id.
      }
    }),
  );
  return out;
}

export async function scoreClaimsForTeamCase(input: {
  teamId: string;
  caseId: string;
  nodes: ClaimMapNode[];
  /** When true, also persist to claim_robustness_scores for cross-team reads. */
  persist?: boolean;
}): Promise<ClaimRobustnessScore[]> {
  const stored = await listEdgesForCase(input.caseId);
  const syn = synthesizeClaimMapEdges({
    teamId: input.teamId,
    caseId: input.caseId,
    nodes: input.nodes,
  });
  const edges: ArgEdge[] = [...stored, ...syn];

  const scored = input.nodes.map((n) =>
    scoreClaimFromEdges({
      claimId: n.claim.id,
      teamId: input.teamId,
      caseId: input.caseId,
      edges,
    }),
  );
  const labels = await datesForRounds([
    ...new Set(scored.flatMap((s) => s.open_from_rounds)),
  ]);
  const scores = scored.map((s) => ({
    ...s,
    open_from_round_dates: s.open_from_rounds
      .map((id) => labels[id])
      .filter((d): d is string => Boolean(d)),
  }));

  if (input.persist !== false) {
    try {
      await upsertClaimRobustnessScores(scores);
    } catch {
      // Table may not be applied yet; scoring still works in memory.
    }
  }

  return scores;
}

export function scoresByClaimId(
  scores: ClaimRobustnessScore[],
): Record<string, ClaimRobustnessScore> {
  const out: Record<string, ClaimRobustnessScore> = {};
  for (const s of scores) out[s.claim_id] = s;
  return out;
}
