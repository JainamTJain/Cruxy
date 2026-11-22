export type Role = "member" | "coach_admin" | "tech_admin";

/** Session-scoped judging access (guests or members for one session). */
export type JudgeAccess = {
  sessionId: string;
  guest: boolean;
};

export type AuthCodeKind = "starter" | "personal" | "admin";

export type ConsentChoice = "recorded" | "text_only" | null;

export interface Team {
  id: string;
  name: string;
  colour: string;
  created_at: string;
}

export interface Person {
  id: string;
  name: string;
  team_id: string | null;
  role: Role;
  email: string | null;
  email_reminders_opt_in: boolean;
  digest_opt_in: boolean;
  consent_version: string | null;
  consent_at: string | null;
  recording_ok: boolean;
  voice_sample_path: string | null;
  /** ECAPA 192-dim voiceprint; raw enrollment audio deleted after this is set (00076). */
  voiceprint?: number[] | null;
  voiceprint_at?: string | null;
  voiceprint_meta?: Record<string, unknown> | null;
  /** Set by the person, tech admin, or transcription vendor after a voice sample. */
  pronunciation_note: string | null;
  first_run_checklist: Record<string, boolean>;
  failed_attempts: number;
  locked_until: string | null;
  last_sign_in_at: string | null;
  /** Bumped on passcode reset so every browser session is signed out. */
  session_version?: number;
  digest_prompted_at?: string | null;
  first_run_completed_at?: string | null;
  created_at: string;
  created_by: string | null;
}

export interface AuthCode {
  id: string;
  kind: AuthCodeKind;
  person_id: string | null;
  hash: string;
  encrypted_copy: string | null;
  must_choose: boolean;
  set_at: string | null;
  last_revealed_at: string | null;
  created_at: string;
}

export interface ActivityLogEntry {
  id: string;
  person_id: string | null;
  action: string;
  target: string | null;
  meta: Record<string, unknown> | null;
  ip_hash: string | null;
  at: string;
}

export interface AiCall {
  id: string;
  feature: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  person_id: string | null;
  refused: boolean;
  refuse_reason: string | null;
  created_at: string;
}

export interface SessionPayload {
  personId: string;
  role: Role;
  name: string;
  teamId: string | null;
  adminView: boolean;
  mustConsent: boolean;
  /** Wave 8: learning profile after consent / voice enrollment. */
  mustSetLearningProfile: boolean;
  mustChoosePasscode: boolean;
  /** Must match people.session_version or the cookie is rejected. */
  sessionVersion: number;
  /** Wave 9: signed-in device row; revoke signs this browser out. */
  deviceId?: string;
}

export interface TeamMembership {
  id: string;
  person_id: string;
  team_id: string;
  from_at: string;
  to_at: string | null;
  created_at: string;
  created_by: string | null;
}

export interface AppNotification {
  id: string;
  person_id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
  created_by: string | null;
}

export interface Competition {
  id: string;
  name: string;
  date: string;
  place: string | null;
  timings: Record<string, unknown> | null;
  created_at: string;
}

export interface CaseRow {
  id: string;
  number: number;
  title: string;
  case_set_page: string | null;
  crux: string | null;
  trap: string | null;
  closing_question: string | null;
  active: boolean;
  created_at: string;
}

/** Per team × case readiness cell on the program map. */
export interface ReadinessCell {
  id: string;
  team_id: string;
  case_id: string;
  readiness_pct: number;
  lead_names: string[];
  latest_event: string | null;
  updated_at: string;
}

export interface ProgramTotals {
  drive_files: number;
  passages_cited: number;
  ideas_accepted: number;
  sources_verified: number;
  bank_questions: number;
  rounds_graded: number;
  redo_improvements: number;
}

export interface SpendCaps {
  monthly_usd: number;
  per_round_usd: number;
  per_research_night_usd: number;
  per_person_assistant_day_usd: number;
  research_paused: boolean;
  updated_at: string;
  updated_by: string | null;
}

/** Book requests live in `@/lib/library/types` (Track 1). */

export interface DriveSortItem {
  id: string;
  filename: string;
  hint: string;
  confidence: number;
  status: "pending" | "sorted";
  created_at: string;
}

export interface CalibrationRow {
  id: string;
  label: string;
  gap: number;
  judge_name: string | null;
  weight: number | null;
  human_cards: number;
  created_at: string;
}

export interface CompetitionLogEntry {
  id: string;
  competition_id: string;
  case_id: string | null;
  case_number: number | null;
  opponent: string;
  moderator_question: string | null;
  judges_questions: string | null;
  judge_comments: string | null;
  score_us: number | null;
  score_them: number | null;
  result: "win" | "loss" | "tie" | "pending" | null;
  team_id: string | null;
  /** Wave 9 C: Competition Day hub fields (nullable for older rows). */
  round_number?: number | null;
  side?: "presenting" | "commenting" | null;
  debrief_worked?: string | null;
  debrief_change?: string | null;
  day_round_id?: string | null;
  created_at: string;
  created_by: string | null;
}

export interface FeatureUsageStat {
  feature: string;
  uses: number;
  unique_people: number;
  useful_marks: number;
}

export interface WeeklyEmailPreview {
  attendance: { name: string; sessions: number; present: number }[];
  scoresByTeam: { team: string; rounds: number; avg: number }[];
  biggestImprovements: string[];
  casesAtRisk: string[];
  openDisagreements: string[];
  thingsToCare: string[];
  spendLine: string | null;
  /** Refused Cruxy calls from the last 24 hours only. */
  errors: string[];
  /** Short note so older refused calls do not look current. */
  errorsNote: string;
  recipients: { name: string; email: string; includeSpend: boolean }[];
}

/** Copy for admin health / weekly error lists. */
export const AI_ERRORS_LAST_24H_NOTE =
  "Only refused Cruxy calls from the last 24 hours. Older ones stay in the ledger but are not shown here.";

export const CONSENT_VERSION = "2026-11-21-v1";

export const CRUXY_PLAIN_WORDS = `Cruxy is Crux's built-in thinking partner. It would rather ask you a good question than hand you an answer. It reads our Drive and cases, finds new sources, asks practice questions, plays the other team or the judge when we need one, and gives feedback that quotes what you said. It can be wrong, so every answer shows its source and every new idea needs a person to accept it. It doesn't train on your recordings.`;
