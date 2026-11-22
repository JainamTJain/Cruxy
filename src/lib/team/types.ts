/** Track 4 Team space types — CaseRole / TruthItem shared with Track 2 case-brain */

import type { CaseRoleKind } from "@/lib/case-brain/types";
export type { CaseRole, TruthItem } from "@/lib/case-brain/types";

export const CASE_ROLE_SLOTS = [
  "lead_1",
  "lead_2",
  "counter_arguer",
  "supporter",
] as const satisfies readonly CaseRoleKind[];

export type CaseRoleSlot = (typeof CASE_ROLE_SLOTS)[number];

export const CASE_ROLE_LABELS: Record<CaseRoleSlot, string> = {
  lead_1: "Lead 1",
  lead_2: "Lead 2",
  counter_arguer: "Counter-arguer",
  supporter: "Supporter",
};

export type AssignmentTargetKind =
  | "case"
  | "deck"
  | "one_pager"
  | "reading"
  | "practice";

export interface Assignment {
  id: string;
  team_id: string;
  case_id: string | null;
  person_id: string;
  task: string;
  target_kind: AssignmentTargetKind;
  target_id: string | null;
  due: string | null;
  assigned_by: string | null;
  status: "open" | "done" | "cancelled";
  created_at: string;
}

export interface ChatChannel {
  id: string;
  channel: string;
  team_id: string | null;
  created_at: string;
  title?: string | null;
  purpose?: string | null;
  audience?: string | null;
  case_id?: string | null;
  kind?: string | null;
}

/** Enriched conversation for the team chat UI. */
export interface ChatConversation extends ChatChannel {
  title: string;
  purpose: string;
  audience: string;
  unread: number;
  case_id: string | null;
  kind: string;
}

export interface ChatMessage {
  id: string;
  chat_id: string;
  person_id: string | null;
  from_cruxy: boolean;
  body: string;
  is_idea: boolean;
  mention_ids: string[];
  case_id: string | null;
  link_refs: Record<string, unknown> | null;
  created_at: string;
}

export interface ClaimNode {
  key: string;
  text: string;
  logic_line: string;
  supports: { key: string; text: string }[];
  counterclaim_response?: string;
}

export interface ClaimMapBody {
  claims: ClaimNode[];
}

export interface ClaimMapVersion {
  id: string;
  team_id: string;
  case_id: string;
  version: number;
  body: ClaimMapBody;
  change_summary: string;
  created_by: string | null;
  created_at: string;
}

export interface ClaimMapConfirmation {
  id: string;
  version_id: string;
  person_id: string;
  confirmed_at: string;
}

export interface ClaimChangeProposal {
  id: string;
  team_id: string;
  case_id: string;
  claim_key: string;
  old_text: string;
  new_text: string;
  reason: string;
  proposed_by: string;
  status: "pending" | "accepted" | "rejected";
  lead_accepter_id: string | null;
  second_accepter_id: string | null;
  resulting_version_id: string | null;
  created_at: string;
}

export interface AlignmentQuestionSet {
  id: string;
  version_id: string;
  person_id: string;
  questions: string[];
  answers: string[] | null;
  drifted: boolean;
  created_at: string;
  answered_at: string | null;
}

export interface DriftFlag {
  id: string;
  team_id: string;
  case_id: string;
  person_id: string | null;
  version_id: string | null;
  source: "alignment" | "transcript" | "manual";
  detail: string;
  transcript_ref: string | null;
  private_to_leads: boolean;
  resolved_at: string | null;
  created_at: string;
}

export interface RoadmapStage {
  id: string;
  person_id: string;
  case_id: string;
  stage: string;
  required: boolean;
  due: string | null;
  done_at: string | null;
  created_at: string;
}

export interface PersonPrefs {
  person_id: string;
  hide_floating_cruxy: boolean;
  cruxy_x: number | null;
  cruxy_y: number | null;
  cruxy_device: string | null;
  /** Wave 9 I access prefs */
  text_size: "sm" | "md" | "lg" | "xl";
  high_contrast: boolean;
  readable_font: boolean;
  reduce_motion: "system" | "on" | "off";
  updated_at: string;
}

export interface HomeDiffItem {
  version_id: string;
  team_id: string;
  case_id: string;
  version: number;
  change_summary: string;
  old_text: string;
  new_text: string;
  confirmed: boolean;
}
