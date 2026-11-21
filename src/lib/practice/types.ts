/** Track 5 Practice domain types (sessions, recording, judging, feedback). */

export type PracticeMode =
  | "full_round"
  | "moderator_drill"
  | "commentary_drill"
  | "judges_qa_drill"
  | "solo_speech"
  | "free_record"
  | "conferral_drill"
  | "thesis_30"
  | "qa_routing";

export type SessionKind = "admin" | "member_practice";

export type RoundPhase =
  | "setup"
  | "presentation"
  | "commentary"
  | "response"
  | "judges_qa"
  | "scoring"
  | "done";

export type AttendanceStatus = "present" | "late" | "absent";
export type AttendanceSource = "admin" | "self" | "voice" | "join";

export type RecordingStatus =
  | "recording"
  | "uploading"
  | "transcribing"
  | "ready"
  | "failed";

/** How the room records (F-218 room, F-219 own device, F-220 mixed). */
export type RecordingLayout = "room" | "own_device" | "mixed";

export type JudgePortalPath = "known" | "guest" | "cruxy";

export interface RoundTimings {
  presentation_min: number;
  presentation_max: number;
  commentary_min: number;
  commentary_max: number;
  qa_min: number;
  qa_max: number;
}

export const DEFAULT_ROUND_TIMINGS: RoundTimings = {
  presentation_min: 7,
  presentation_max: 12,
  commentary_min: 5,
  commentary_max: 8,
  qa_min: 10,
  qa_max: 15,
};

/** APPE IEB Fillable Scoring Sheet (August 2020) items. */
export const APPE_SCORE_ITEMS = [
  {
    key: "presentation_a",
    label: "Presentation A",
    question: "Was the presentation clear and systematic?",
    min: 1,
    max: 10,
  },
  {
    key: "presentation_b",
    label: "Presentation B",
    question:
      "Did the presentation clearly identify and thoroughly discuss the central moral dimensions of the case?",
    min: 1,
    max: 10,
  },
  {
    key: "presentation_c",
    label: "Presentation C",
    question:
      "Did the presentation show awareness of and thoughtful consideration for different viewpoints, especially those that would weigh heavily for those who disagree?",
    min: 1,
    max: 10,
  },
  {
    key: "commentary",
    label: "Commentary",
    question: "The team's commentary on the other team's presentation",
    min: 1,
    max: 10,
  },
  {
    key: "response_to_commentary",
    label: "Response to commentary",
    question: "The team's response to the other team's commentary",
    min: 1,
    max: 10,
  },
  {
    key: "response_to_judges",
    label: "Response to judges",
    question: "The team's answers to the judges' questions",
    min: 1,
    max: 10,
  },
] as const;

export type AppeItemKey = (typeof APPE_SCORE_ITEMS)[number]["key"];

export interface PracticeSession {
  id: string;
  kind: SessionKind;
  date: string;
  place: string | null;
  online: boolean;
  /** Hashed only — never store plaintext. */
  code_hash: string | null;
  /** Plaintext code shown only to admins at create time; not persisted after response. */
  title: string;
  status: "scheduled" | "live" | "ended";
  created_by: string | null;
  created_at: string;
  /** For member-started practices. */
  mode: PracticeMode | null;
  invite_team_ids: string[];
}

export interface PracticeRound {
  id: string;
  session_id: string;
  case_id: string | null;
  case_number: number | null;
  team_ids: string[];
  /** presenter / commenter team ids */
  sides: { presenting: string | null; commenting: string | null };
  moderator: "cruxy" | string | null;
  judges: {
    humans: string[];
    cruxy: boolean;
  };
  timings: RoundTimings;
  phase: RoundPhase;
  mode: PracticeMode;
  order: number;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  created_by: string | null;
  /** One mic in the room, each phone, or both lined up by time. */
  recording_layout?: RecordingLayout;
}

export interface AttendanceRow {
  id: string;
  session_id: string;
  person_id: string;
  status: AttendanceStatus;
  source: AttendanceSource;
  created_at: string;
}

export interface RecordingRow {
  id: string;
  round_id: string;
  chunk_paths: string[];
  /** Chunk index → byte length (for resume / loss bound). */
  chunk_meta: { index: number; bytes: number; uploaded_at: string }[];
  status: RecordingStatus;
  deleted_at: string | null;
  transcript_job_id: string | null;
  created_at: string;
  created_by: string | null;
  /** Own-device path: this recording belongs to one person. */
  owner_person_id?: string | null;
  /** Wall-clock start for lining mixed devices up by timestamp. */
  started_at?: string | null;
}

export interface TranscriptLine {
  id: string;
  round_id: string;
  start_ms: number;
  end_ms: number;
  speaker_person_id: string | null;
  speaker_label: string | null;
  text: string;
  corrected: boolean;
  created_at: string;
}

export interface GlossaryTerm {
  id: string;
  case_id: string | null;
  term: string;
  misheard: string[];
  pronunciation: string | null;
  created_at: string;
}

export interface JudgeRow {
  id: string;
  name: string;
  background: string | null;
  /** Internal calibration weight — never shown to members. */
  weight: number | null;
  person_id: string | null;
  guest_token_hash: string | null;
  created_at: string;
}

export interface JudgeCard {
  id: string;
  round_id: string;
  judge_id: string | null;
  cruxy: boolean;
  team_id: string;
  spirit: number | null;
  spirit_comment: string | null;
  overall_comment: string | null;
  moments: { line_id: string; note: string }[];
  /** Predict-your-score guesses keyed by item (speaker self-eval). */
  predictions: Record<string, number> | null;
  calibration_note: string | null;
  calibration_use: "full" | "reduced" | "feedback_only" | null;
  created_at: string;
  created_by: string | null;
}

export interface CardScore {
  id: string;
  card_id: string;
  item: AppeItemKey | string;
  score: number;
  comment: string | null;
  evidence_line_ids: string[];
  created_at: string;
}

export interface FeedbackItem {
  id: string;
  round_id: string;
  person_id: string;
  kind: "worked" | "fix" | "headline";
  quote_line_id: string | null;
  scoring_item: string | null;
  reasoning: string;
  better_version: string | null;
  audience_heard: string | null;
  created_at: string;
}

export interface RedoRow {
  id: string;
  feedback_item_id: string;
  person_id: string;
  transcript_ref: string | null;
  score_before: number | null;
  score_after: number | null;
  open: boolean;
  created_at: string;
}

export interface BankEntry {
  id: string;
  lesson: string;
  example_line_id: string | null;
  why: string | null;
  improved: string | null;
  drill_id: string | null;
  seen_count: number;
  case_id: string | null;
  created_at: string;
  created_by: string | null;
}

export interface SkillChart {
  person_id: string;
  skills: Record<string, number>;
  updated_at: string;
}

export interface RoundReport {
  id: string;
  round_id: string;
  headline: string;
  socratic_followups: string[];
  proposal_ids: string[];
  created_at: string;
}

export interface SpeakerLabelConfirm {
  round_id: string;
  mappings: { speaker_label: string; person_id: string | null }[];
  confirmed_by: string | null;
  confirmed_at: string | null;
}

export interface TalkAnalytics {
  person_id: string;
  round_id: string;
  talk_ms: number;
  words: number;
  filler_count: number;
  time_to_first_answer_ms: number | null;
  interruptions: number;
}
