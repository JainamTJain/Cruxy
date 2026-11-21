/**
 * Compute DF-QuAD robustness for every claim on a case (all teams).
 * Scores are shared: any team can read any team's claim scores for the case.
 */
import "server-only";

import { scoreClaimFromEdges } from "@/lib/arg-graph/df-quad";
import { synthesizeClaimMapEdges } from "@/lib/arg-graph/synthesize";
import type { ArgEdge, ClaimRobustnessScore } from "@/lib/arg-graph/types";
import type { ClaimMapNode } from "@/lib/case-brain/types";
import {
  listEdgesForCase,
  upsertClaimRobustnessScores,
} from "@/lib/db/supabase/arg-graph-extra";

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

  const scores = input.nodes.map((n) =>
    scoreClaimFromEdges({
      claimId: n.claim.id,
      teamId: input.teamId,
      caseId: input.caseId,
      edges,
    }),
  );

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
