/**
 * H Wave 6 scoring types. Edge shape comes from K's graph spine.
 */
export type { ArgEdge, ArgEdgeType, ArgNodeKind } from "@/lib/graph/types";

/** Per-claim gradual-semantics robustness (shared across teams). */
export type ClaimRobustnessScore = {
  claim_id: string;
  team_id: string;
  case_id: string;
  /** 0..1 DF-QuAD style score, computed in code. */
  score: number;
  /** Display percent 0..100. */
  score_pct: number;
  attacks_answered: number;
  attacks_open: number;
  /** Round ids for open attacks. Never shown in the UI. */
  open_from_rounds: string[];
  /** Display dates for those rounds, like "Nov 21". Stored in 00040. */
  open_from_round_dates: string[];
  support_strength: number;
  attack_strength: number;
};
