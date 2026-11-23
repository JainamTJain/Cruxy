/**
 * Critique engine types for the working-document suggestion rail.
 */
import type { WorkingSectionKey } from "@/lib/db/supabase/working-doc-extra";

/** Suggestion kinds that make a case, not only ask. */
export const CRITIQUE_KINDS = [
  "missing_perspective",
  "missing_stakeholder",
  "unanswered_counter",
  "logical_fallacy",
  "disconnected_claim",
  "loose_end",
  "evidence_gap",
  "sharper_wording",
  "missing_link",
] as const;

export type CritiqueKind = (typeof CRITIQUE_KINDS)[number];

export type TruthSourceKind =
  | "case_set"
  | "domain_prep"
  | "research"
  | "transcript"
  | "traveled_idea"
  /** This team's own notes, highlights and imported readings (never shared). */
  | "team_reading";

export type TruthSourceItem = {
  id: string;
  kind: TruthSourceKind;
  /** Short label for the rail citation (never a team name). */
  label: string;
  text: string;
  /** Optional stable pointer (passage id, finding id, travel score id). */
  ref: string | null;
};

/** One critique finding before it is posted to the rail. */
export type CritiqueFinding = {
  kind: CritiqueKind;
  sectionKey: WorkingSectionKey;
  /** Where the point is weak. */
  weakSpot: string;
  /** Why it is weak. */
  why: string;
  /** A stronger version the team can take or adapt. */
  stronger: string;
  /** Always ends with a question back. */
  questionBack: string;
  /** Named fallacy when kind is logical_fallacy. */
  fallacyName: string | null;
  /** The reconstructed chain, e.g. "A, so B. B, so C. Missing: B leads to C". */
  chain?: string | null;
  truthSourceId: string | null;
  cannotCite: boolean;
  /** Rank within the section (lower is stronger). */
  rank: number;
};

export type CritiqueRunResult = {
  caseId: string;
  teamId: string;
  posted: number;
  skippedCap: number;
  findings: CritiqueFinding[];
  notes: string | null;
};

export const OPEN_PER_SECTION_CAP = 5;
