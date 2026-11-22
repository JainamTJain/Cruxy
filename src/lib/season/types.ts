/**
 * Wave 9 H: after the regional.
 * Round rows live in competition_logs (agreed field names in wave9.md).
 */

export type SeasonStatus = "active" | "archived";

export type Season = {
  id: string;
  label: string;
  status: SeasonStatus;
  competition_id: string | null;
  archived_at: string | null;
  archive_storage_path: string | null;
  created_at: string;
  created_by: string | null;
};

export type CompetitionTeamResult = {
  id: string;
  season_id: string;
  competition_id: string | null;
  team_id: string;
  rounds_played: number;
  wins: number;
  losses: number;
  ties: number;
  advanced: boolean;
  advancement_note: string | null;
  notes: string | null;
  entered_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SeasonRetro = {
  id: string;
  season_id: string;
  team_id: string;
  what_worked: string;
  what_to_change: string;
  cases_that_landed: string;
  arguments_that_landed: string;
  status: "draft" | "published";
  created_by: string | null;
  updated_at: string;
};

export type RetroCitationQuote = {
  log_id: string;
  quote: string;
  opponent: string;
  case_number: number | null;
};

export type RetroCommentTheme = {
  id: string;
  season_id: string;
  team_id: string;
  theme: string;
  summary: string;
  citation_log_ids: string[];
  citation_quotes: RetroCitationQuote[];
  created_at: string;
  created_by: string | null;
};

export type NationalsChecklistItem = {
  id: string;
  season_id: string;
  team_id: string;
  label: string;
  detail: string;
  done: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type HandoffWhoDidWhat = {
  person_id: string | null;
  person_name: string;
  role: string;
  cases: string;
  notes: string;
};

export type SeasonHandoff = {
  id: string;
  season_id: string;
  body: string;
  who_did_what: HandoffWhoDidWhat[];
  updated_at: string;
  updated_by: string | null;
};

/** Default Nationals checklist when a team advances. */
export const DEFAULT_NATIONALS_CHECKLIST: Array<{
  label: string;
  detail: string;
}> = [
  {
    label: "Confirm which cases travel",
    detail: "Reuse the regional briefs and mark weak spots from the retro.",
  },
  {
    label: "Refresh Evidence Library citations",
    detail: "Check open sources still hold; request anything still paywalled.",
  },
  {
    label: "Rebuild Q and A from UCSB comments",
    detail: "Use themed judge comments and Asked at UCSB bank items.",
  },
  {
    label: "Practice against the steelman",
    detail: "Run drills on the opposing lines that hurt most at the regional.",
  },
  {
    label: "Logistics and roles",
    detail: "Speakers, timers, travel, and who owns each case for Nationals.",
  },
];
