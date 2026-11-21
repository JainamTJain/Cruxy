/**
 * Team doc import writes candidate argument nodes (Wave 6 H).
 * Edges for proposals go through K's recordEdge when a proposal id exists.
 */
import "server-only";

import { upsertCandidateNode } from "@/lib/db/supabase/arg-graph-extra";
import { recordEdge } from "@/lib/graph";
import type { ArgNodeKind } from "@/lib/graph/types";

export type CandidateFromIdea = {
  text: string;
  kind: string;
  proposalId?: string | null;
  citationIds?: string[];
};

function mapKind(kind: string): ArgNodeKind | "candidate" {
  if (kind === "claim") return "claim";
  if (
    kind === "framework" ||
    kind === "fact" ||
    kind === "quote" ||
    kind === "example"
  ) {
    return "truth_item";
  }
  if (kind === "proposal") return "proposal";
  return "candidate";
}

export async function writeCandidateNodesFromTeamDoc(input: {
  teamId: string;
  caseId: string;
  importId: string;
  personId: string | null;
  ideas: CandidateFromIdea[];
}): Promise<number> {
  let n = 0;
  for (const idea of input.ideas) {
    const text = idea.text.trim();
    if (!text) continue;
    const kind = mapKind(idea.kind);
    const row = await upsertCandidateNode({
      team_id: input.teamId,
      case_id: input.caseId,
      kind,
      text: text.slice(0, 2000),
      import_id: input.importId,
      proposal_id: idea.proposalId ?? null,
      citation_ids: idea.citationIds ?? [],
      status: "candidate",
      created_by: input.personId,
    });
    n += 1;

    // Link the proposal to the import via inspired_by (valid node kinds only).
    if (idea.proposalId) {
      const passageId = (idea.citationIds ?? []).find((id) =>
        /^[0-9a-f-]{36}$/i.test(id),
      );
      if (passageId) {
        await recordEdge({
          from_kind: "proposal",
          from_id: idea.proposalId,
          to_kind: "passage",
          to_id: passageId,
          type: "inspired_by",
          weight: 0.5,
          source_kind: "team_doc_candidate",
          source_id: row.id,
          team_id: input.teamId,
          case_id: input.caseId,
          created_by: input.personId,
        });
      }
    }
  }
  return n;
}
