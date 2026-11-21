/**
 * Build support edges from a team's real claim map for scoring.
 * Round attacks come only from classified judge questions via recordEdge.
 */
import type { ClaimMapNode } from "@/lib/case-brain/types";
import type { ArgEdge } from "@/lib/graph/types";
import { makeEdgeKey } from "@/lib/graph/types";

export function synthesizeClaimMapEdges(input: {
  teamId: string;
  caseId: string;
  nodes: ClaimMapNode[];
}): ArgEdge[] {
  const at = new Date(0).toISOString();
  const edges: ArgEdge[] = [];

  for (const node of input.nodes) {
    for (const s of node.supports) {
      const partial = {
        from_kind: "support" as const,
        from_id: s.support.id,
        to_kind: "claim" as const,
        to_id: node.claim.id,
        type: "supports" as const,
        source_kind: "claim_map",
        source_id: s.support.id,
      };
      edges.push({
        id: `syn-support-${s.support.id}`,
        edge_key: makeEdgeKey(partial),
        ...partial,
        weight: s.backings.length > 0 ? 0.7 : 0.4,
        round_id: null,
        line_id: null,
        team_id: input.teamId,
        case_id: input.caseId,
        created_by: null,
        created_at: at,
      });
    }

    for (const cc of node.counterclaims) {
      const answers: Array<"concedes" | "distinguishes" | "rebuts"> = [];
      if (cc.concede) answers.push("concedes");
      if (cc.distinguish) answers.push("distinguishes");
      if (cc.rebut) answers.push("rebuts");
      for (const type of answers) {
        const partial = {
          from_kind: "counterclaim" as const,
          from_id: cc.id,
          to_kind: "counterclaim" as const,
          to_id: cc.id,
          type,
          source_kind: "claim_map",
          source_id: cc.id,
        };
        edges.push({
          id: `syn-${type}-${cc.id}`,
          edge_key: makeEdgeKey(partial),
          ...partial,
          weight: 0.5,
          round_id: null,
          line_id: null,
          team_id: input.teamId,
          case_id: input.caseId,
          created_by: null,
          created_at: at,
        });
      }
    }
  }

  return edges;
}
