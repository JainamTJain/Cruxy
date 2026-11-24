import type { FileSegment } from "@/lib/library/segments";
import type { CaseRow } from "@/lib/types";

export type CaseStakeholder = {
  id: string;
  case_id: string;
  who: string;
  stake: string;
  voice_in_case: string | null;
  ord: number;
};

/** Cruxy fallacy flag on a key point or note (hidden when sound). */
export type SegmentFallacyFlag = {
  name: string;
  why: string;
  better: string;
};

/** Per-team wording override for one distilled Drive point. */
export type FileSegmentOverride = {
  id: string;
  team_id: string;
  segment_id: string;
  body: string;
  original_body: string;
  edited_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Hash-keyed cache row for a fallacy check. */
export type SegmentFallacyCacheRow = {
  text_hash: string;
  sound: boolean;
  fallacy_name: string | null;
  why: string | null;
  better_wording: string | null;
  created_at: string;
  updated_at: string;
};

/** Distilled Drive point as shown on the case page (team override applied). */
export type CaseReadingSegment = FileSegment & {
  display_body: string;
  original_body: string;
  edited_by_name: string | null;
  edited_at: string | null;
  fallacy: SegmentFallacyFlag | null;
};

export type CaseAnnotation = {
  id: string;
  kind: "highlight" | "comment" | "question";
  body: string;
  range: string | null;
  person_id?: string | null;
  person_name: string | null;
  team_colour: string | null;
  passage_anchor: string | null;
  passage_id?: string | null;
  created_at: string;
};

export type CaseParagraph = {
  id: string;
  text: string;
  anchor: string | null;
  file_id: string | null;
  /** Real passage this paragraph starts in; highlights and notes attach here. */
  passage_id?: string | null;
};

export type IdeaEvent = {
  id: string;
  at: string;
  kind: "version" | "accepted" | "question" | "note";
  title: string;
  detail: string;
  by_name: string | null;
};

export type CaseFileBrief = {
  id: string;
  name: string;
  type: string | null;
  /** Plain file type label for students (never raw enum). */
  type_label: string;
  path: string | null;
  segment_count: number;
  what: string | null;
};

export type CaseHomePayload = {
  case: CaseRow;
  stakeholders: CaseStakeholder[];
  paragraphs: CaseParagraph[];
  /** Footnotes of this case, numbered as in the case set. */
  sources?: { n: number; text: string }[];
  annotations: CaseAnnotation[];
  ideas: IdeaEvent[];
  files: CaseFileBrief[];
  segments_by_file: Record<string, CaseReadingSegment[]>;
  source: "case_set" | "seed";
};
