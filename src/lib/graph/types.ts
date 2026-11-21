/** Wave 6 argument graph: node kinds and edge types for arg_edges. */

export const ARG_NODE_KINDS = [
  "claim",
  "support",
  "backing",
  "counterclaim",
  "truth_item",
  "proposal",
  "passage",
  "transcript_line",
  "question",
  "feedback_item",
  "team",
  "person",
] as const;

export type ArgNodeKind = (typeof ARG_NODE_KINDS)[number];

export const ARG_EDGE_TYPES = [
  "supports",
  "attacks",
  "concedes",
  "distinguishes",
  "rebuts",
  "cites",
  "contradicts",
  "inspired_by",
  "used_in_round",
  "tested_by_question",
] as const;

export type ArgEdgeType = (typeof ARG_EDGE_TYPES)[number];

export type ArgEdge = {
  id: string;
  edge_key: string;
  from_kind: ArgNodeKind;
  from_id: string;
  to_kind: ArgNodeKind;
  to_id: string;
  type: ArgEdgeType;
  weight: number;
  source_kind: string | null;
  source_id: string | null;
  round_id: string | null;
  line_id: string | null;
  team_id: string | null;
  case_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type RecordEdgeInput = {
  from_kind: ArgNodeKind;
  from_id: string;
  to_kind: ArgNodeKind;
  to_id: string;
  type: ArgEdgeType;
  /** 0 to 1; default 1. */
  weight?: number;
  source_kind?: string | null;
  source_id?: string | null;
  round_id?: string | null;
  line_id?: string | null;
  team_id?: string | null;
  case_id?: string | null;
  created_by?: string | null;
  /** Skip activity_log (bulk backfill). Default false. */
  skipActivityLog?: boolean;
};

/** Stable idempotent key for one (from, type, to, source) edge. */
export function makeEdgeKey(input: {
  from_kind: string;
  from_id: string;
  to_kind: string;
  to_id: string;
  type: string;
  source_kind?: string | null;
  source_id?: string | null;
}): string {
  return [
    input.from_kind,
    input.from_id,
    input.type,
    input.to_kind,
    input.to_id,
    input.source_kind ?? "",
    input.source_id ?? "",
  ].join("|");
}
