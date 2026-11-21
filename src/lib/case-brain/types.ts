/** Track 2 Case brain domain types. */

export type TruthKind = "fact" | "quote" | "example" | "framework";

export type ProposalOrigin =
  | "transcript"
  | "research"
  | "reading"
  | "team_doc"
  | "inspired_by_team"
  | "member";

export type ProposalStatus = "pending" | "accepted" | "rejected" | "edited";

export type DecisionVerdict = "accept" | "reject" | "edit";

export type CaseRoleKind =
  | "lead_1"
  | "lead_2"
  | "counter_arguer"
  | "supporter";

export type HistoryTargetKind =
  | "claim"
  | "support"
  | "backing"
  | "counterclaim"
  | "truth_item"
  | "proposal"
  | "decision"
  | "opposing_position"
  | "case_role";

export interface Claim {
  id: string;
  team_id: string;
  case_id: string;
  text: string;
  logic_line: string | null;
  ord: number;
  citation_ids: string[];
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface Support {
  id: string;
  claim_id: string;
  team_id: string;
  case_id: string;
  text: string;
  logic_line: string | null;
  ord: number;
  citation_ids: string[];
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface Backing {
  id: string;
  support_id: string;
  team_id: string;
  case_id: string;
  kind: "case_fact" | "source" | "example" | "framework";
  text: string;
  citation_ids: string[];
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface Counterclaim {
  id: string;
  team_id: string;
  case_id: string;
  claim_id: string | null;
  text: string;
  concede: string | null;
  distinguish: string | null;
  rebut: string | null;
  citation_ids: string[];
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface TruthItem {
  id: string;
  team_id: string;
  case_id: string;
  kind: TruthKind;
  text: string;
  citation_ids: string[];
  status: "accepted" | "reopened" | "rejected";
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface Proposal {
  id: string;
  team_id: string;
  case_id: string;
  /** Stable key so other teams' decisions on the same idea can be shown together. */
  idea_key: string;
  origin: ProposalOrigin;
  origin_ref: string | null;
  inspired_from_team_id: string | null;
  text: string;
  kind: TruthKind | "claim_edit" | "support_edit" | "other";
  /** Passage / truth / team-doc passage ids this proposal cites. */
  citation_ids: string[];
  /** Analyst one-liner only when there is a problem; null means it passed. */
  cruxy_note: string | null;
  socratic_question: string | null;
  socratic_answered: boolean;
  status: ProposalStatus;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface Decision {
  id: string;
  proposal_id: string;
  person_id: string;
  team_id: string;
  verdict: DecisionVerdict;
  reason: string;
  edited_text: string | null;
  created_at: string;
  created_by: string | null;
}

export interface CaseRole {
  id: string;
  team_id: string;
  case_id: string;
  person_id: string;
  role: CaseRoleKind;
  created_at: string;
  created_by: string | null;
}

export interface OpposingPosition {
  id: string;
  case_id: string;
  title: string;
  strongest_support: string;
  weak_point: string;
  commentary_angles: [string, string];
  origin: "cruxy" | "team" | "competition";
  added_by_team_id: string | null;
  created_at: string;
  created_by: string | null;
}

export interface ItemHistoryEntry {
  id: string;
  target_kind: HistoryTargetKind;
  target_id: string;
  team_id: string | null;
  case_id: string | null;
  person_id: string | null;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  at: string;
}

export interface TeamPrinciple {
  id: string;
  team_id: string;
  case_id: string;
  principle: string;
  claim_id: string | null;
  created_at: string;
  created_by: string | null;
}

export interface ChangeTheFactsItem {
  id: string;
  team_id: string;
  case_id: string;
  claim_id: string;
  fact: string;
  why_flips: string;
  prepared_answer: string | null;
  created_at: string;
  created_by: string | null;
}

export interface ConsistencyFlag {
  id: string;
  team_id: string;
  case_id_a: string;
  case_id_b: string;
  principle_a: string;
  principle_b: string;
  note: string;
  created_at: string;
}

export interface ClaimMapNode {
  claim: Claim;
  supports: Array<{
    support: Support;
    backings: Backing[];
  }>;
  counterclaims: Counterclaim[];
}

export interface RobustnessScores {
  supports_backed: number;
  supports_total: number;
  counterclaims_answered: number;
  counterclaims_total: number;
  truth_verified: number;
  truth_total: number;
  unverified_open: number;
  /** 0–100 overall readiness for this team's case map */
  overall: number;
}

export interface CaseBrainSnapshot {
  case_id: string;
  team_id: string;
  claims: ClaimMapNode[];
  truth_items: TruthItem[];
  proposals: Proposal[];
  decisions_by_proposal: Record<string, Decision[]>;
  /** Other teams' decisions keyed by idea_key */
  peer_decisions_by_idea: Record<
    string,
    Array<Decision & { team_name: string; proposal_text: string }>
  >;
  case_roles: CaseRole[];
  opposing_positions: OpposingPosition[];
  history: ItemHistoryEntry[];
  principles: TeamPrinciple[];
  change_the_facts: ChangeTheFactsItem[];
  consistency_flags: ConsistencyFlag[];
  robustness: RobustnessScores;
}
