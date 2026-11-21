export type Role = "member" | "coach_admin" | "tech_admin";

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
  first_run_checklist: Record<string, boolean>;
  failed_attempts: number;
  locked_until: string | null;
  last_sign_in_at: string | null;
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
  mustChoosePasscode: boolean;
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

export const CONSENT_VERSION = "2026-11-21-v1";

export const CRUXY_PLAIN_WORDS = `Cruxy is Crux's built-in thinking partner. It would rather ask you a good question than hand you an answer. It reads our Drive and cases, finds new sources, asks practice questions, plays the other team or the judge when we need one, and gives feedback that quotes what you said. It can be wrong, so every answer shows its source and every new idea needs a person to accept it. It doesn't train on your recordings.`;
