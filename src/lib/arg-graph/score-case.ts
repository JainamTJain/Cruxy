/**
 * Compute DF-QuAD robustness for every claim on a case (all teams).
 * Scores are shared: any team can read any team's claim scores for the case.
 */
import "server-only";

import {
  formatRoundDateLabel,
  scoreClaimFromEdges,
} from "@/lib/arg-graph/df-quad";
import { synthesizeClaimMapEdges } from "@/lib/arg-graph/synthesize";
import type { ArgEdge, ClaimRobustnessScore } from "@/lib/arg-graph/types";
import type { ClaimMapNode } from "@/lib/case-brain/types";
import {
  listEdgesForCase,
  upsertClaimRobustnessScores,
} from "@/lib/db/supabase/arg-graph-extra";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore } from "@/lib/db/sample-store";
import { getServiceSupabase } from "@/lib/db/supabase/client";

async function roundDateLabelsFor(
  roundIds: string[],
): Promise<Record<string, string>> {
  const ids = [...new Set(roundIds.filter(Boolean))];
  if (!ids.length) return {};
  const out: Record<string, string> = {};

  if (isSampleDataMode()) {
    const store = await readStore();
    const rounds =
      (store as unknown as { practice_rounds?: Array<{ id: string; created_at?: string; started_at?: string }> })
        .practice_rounds ?? [];
    for (const id of ids) {
      const r = rounds.find((x) => x.id === id);
      const label = formatRoundDateLabel(r?.started_at ?? r?.created_at);
      if (label) out[id] = label;
    }
    return out;
  }

  try {
    const { data } = await getServiceSupabase()
      .from("rounds")
      .select("id, created_at, started_at")
      .in("id", ids);
    for (const row of (data as Array<{
      id: string;
      created_at?: string;
      started_at?: string | null;
    }> | null) ?? []) {
      const label = formatRoundDateLabel(row.started_at ?? row.created_at);
      if (label) out[row.id] = label;
    }
  } catch {
    /* rounds table may be unavailable in partial setups */
  }
  return out;
}

export async function scoreClaimsForTeamCase(input: {
  teamId: string;
  caseId: string;
  nodes: ClaimMapNode[];
  persist?: boolean;
}): Promise<ClaimRobustnessScore[]> {
  const stored = await listEdgesForCase(input.caseId);
  const syn = synthesizeClaimMapEdges({
    teamId: input.teamId,
    caseId: input.caseId,
    nodes: input.nodes,
  });
  const edges: ArgEdge[] = [...stored, ...syn];

  const roundIds = edges
    .map((e) => e.round_id)
    .filter((id): id is string => Boolean(id));
  const roundDateLabels = await roundDateLabelsFor(roundIds);

  const scores = input.nodes.map((n) =>
    scoreClaimFromEdges({
      claimId: n.claim.id,
      teamId: input.teamId,
      caseId: input.caseId,
      edges,
      roundDateLabels,
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
