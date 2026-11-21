/** Track 3 Revision domain types (sample + SQL).
 * Shared claim-map / Truth Source shapes come from Track 2 case-brain.
 */

import type {
  CaseRole,
  Claim,
  Counterclaim,
  Support,
  TruthItem as CaseBrainTruthItem,
} from "@/lib/case-brain/types";

export type {
  CaseRoleKind,
  TruthKind,
} from "@/lib/case-brain/types";

export type TruthItem = CaseBrainTruthItem;
export type ClaimRow = Claim;
export type SupportRow = Support;
export type CounterclaimRow = Counterclaim;
export type CaseRoleRow = CaseRole;

export type QuestionOrigin =
  | "dr_b"
  | "cruxy"
  | "member"
  | "asked_at_round"
  | "case_set";

export type QuestionType =
  | "follow_up"
  | "pushback"
  | "other_team"
  | "change_facts"
  | "state_view"
  | "closing";

export type QuestionStatus = "pending_confirm" | "active" | "rejected";

export type RoadmapStageId =
  | "read"
  | "map"
  | "one_pager"
  | "flashcards"
  | "question_drill"
  | "practiced"
  | "judged";

export type OriginTag =
  | "Cruxy"
  | "Dr. B"
  | "member"
  | "Inspired by Team 1"
  | "Inspired by Team 2"
  | "Inspired by Team 3"
  | "APPE"
  | "case set";

export type VisualKind =
  | "claim_map"
  | "values_scale"
  | "stakeholder_grid"
  | "fact_timeline"
  | "framework_strip"
  | "question_table";

export interface OnePagerVisual {
  kind: VisualKind;
  title: string;
  payload: Record<string, unknown>;
}

export interface OnePagerBody {
  claims: {
    text: string;
    logic_line: string;
    supports: string[];
  }[];
  counterclaim: {
    text: string;
    concede: string;
    distinguish: string;
    rebut: string;
  } | null;
  language?: {
    plain: string;
    analogies: string[];
    vivid: string;
    avoid: string[];
  };
  visuals: OnePagerVisual[];
  empty_rows: string[];
}

export interface OnePager {
  id: string;
  team_id: string;
  case_id: string;
  version: number;
  body: OnePagerBody;
  previous_body: OnePagerBody | null;
  change_note: string | null;
  signed_off_by: string[];
  drive_doc_id: string | null;
  drive_pdf_exported: boolean;
  origin_tag: OriginTag;
  created_at: string;
  created_by: string | null;
}

export interface Flashcard {
  id: string;
  team_id: string;
  case_id: string;
  deck: string;
  front: string;
  back: string;
  citation_ids: string[];
  truth_item_id: string | null;
  source_kind: "truth" | "reading" | "case_card" | "manual";
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

/** FSRS scheduling state per person × card */
export interface CardFsrsState {
  id: string;
  person_id: string;
  card_id: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3; // New, Learning, Review, Relearning
  last_review: string | null;
  correct_streak: number;
  created_at: string;
}

export interface CardReview {
  id: string;
  person_id: string;
  card_id: string;
  grade: number; // 1–4 FSRS rating
  next_due: string;
  mode: "typed" | "spoken";
  created_at: string;
  created_by: string | null;
}

export interface DeckOptIn {
  id: string;
  person_id: string;
  team_id: string;
  case_id: string;
  assigned: boolean;
  created_at: string;
}

export interface ModeratorQuestion {
  id: string;
  case_id: string;
  text: string;
  type: QuestionType;
  difficulty: 1 | 2 | 3;
  origin: QuestionOrigin;
  origin_label: string;
  status: QuestionStatus;
  asked_at_tag: string | null;
  created_at: string;
  created_by: string | null;
}

export interface QuestionAnswer {
  id: string;
  question_id: string;
  person_id: string;
  team_id: string | null;
  text: string;
  mode: "typed" | "spoken";
  transcript_ref: string | null;
  score: number | null;
  feedback: string | null;
  created_at: string;
  created_by: string | null;
}

export interface RoadmapStage {
  id: string;
  person_id: string;
  case_id: string;
  stage: RoadmapStageId;
  required: boolean;
  due: string | null;
  done_at: string | null;
  created_at: string;
  created_by: string | null;
}

export interface PhrasebookEntry {
  id: string;
  person_id: string;
  case_id: string | null;
  claim_ref: string | null;
  text: string;
  kind: "plain" | "analogy" | "vivid" | "custom";
  created_at: string;
}

export interface SocraticSession {
  id: string;
  person_id: string;
  team_id: string;
  case_id: string;
  turns: {
    role: "cruxy" | "person";
    text: string;
    at: string;
  }[];
  summary: string | null;
  claim_links: string[];
  status: "active" | "done";
  created_at: string;
  updated_at: string;
}

export interface ReadingProgress {
  id: string;
  person_id: string;
  case_id: string;
  file_id: string;
  opened_ratio: number;
  created_at: string;
  updated_at: string;
}

export interface PracticeSpeakLog {
  id: string;
  person_id: string;
  case_id: string;
  round_id: string | null;
  spoken: boolean;
  created_at: string;
}

export interface JudgeAttempt {
  id: string;
  person_id: string;
  case_id: string;
  score: number;
  created_at: string;
}

export const ROADMAP_STAGES: RoadmapStageId[] = [
  "read",
  "map",
  "one_pager",
  "flashcards",
  "question_drill",
  "practiced",
  "judged",
];

export const DEFAULT_STAGE_DEADLINES: Record<RoadmapStageId, string> = {
  read: "2026-11-24",
  map: "2026-11-25",
  one_pager: "2026-11-28",
  flashcards: "2026-12-02",
  question_drill: "2026-12-02",
  practiced: "2026-12-03",
  judged: "2026-12-04",
};
