/** Design tokens (locked for Track 0 per plan / canvas v2). */
export const TOKENS = {
  cardinal: "#9D2235",
  gold: "#F5B700",
  ink: "#111318",
  paper: "#F3F4F6",
  mist: "#E8E4DC",
  team1: "#0F7B6C",
  team2: "#4F46E5",
  team3: "#C2410C",
} as const;

export const MONTHLY_CAP_USD_DEFAULT = 30;
export const PER_ROUND_CAP_USD = 0.75;
export const PER_RESEARCH_NIGHT_CAP_USD = 0.25;
export const PER_PERSON_ASSISTANT_DAY_CAP_USD = 0.2;
export const CAP_ALERT_RATIO = 0.8;

export const SESSION_DAYS = 30;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 10;
export const REVEAL_SECONDS = 20;
export const REAUTH_WINDOW_MS = 10 * 60 * 1000;

/** Local/dev sample member starter only — not for production. */
export const SAMPLE_MEMBER_STARTER = "482913";

/** Local/dev sample coach starter (Dr. B) only — not for production. */
export const SAMPLE_COACH_STARTER = "719304";

/** Local/dev sample tech-admin starter (Jainam) only — not for production. */
export const SAMPLE_ADMIN_STARTER = "135790";

/** Stable seed id for Dr. B (matches supabase/seed.sql). */
export const COACH_PERSON_ID = "a0000000-0000-0000-0000-0000000000b0";

export const CASE_TITLES: { number: number; title: string; active: boolean }[] =
  [
    { number: 1, title: "CTRL-ALT-DEFENSE", active: true },
    { number: 2, title: "(inactive for California)", active: false },
    { number: 3, title: "Sister City No More", active: true },
    { number: 4, title: "Judging a Book by the Cover", active: true },
    { number: 5, title: "The Gambler", active: true },
    { number: 6, title: "(inactive for California)", active: false },
    { number: 7, title: "Equal Access Activism", active: true },
    { number: 8, title: "(inactive for California)", active: false },
    { number: 9, title: "GEM in the Rough", active: true },
    { number: 10, title: "To Be, or Not to Be…Forgotten?", active: true },
    { number: 11, title: "The Cost of a Conscience", active: true },
    { number: 12, title: "Medicine and Misinformation", active: true },
    { number: 13, title: "Normally Distributed Violence", active: true },
    { number: 14, title: "The Allure of the Machine", active: true },
    { number: 15, title: "Udderly Conflicted", active: true },
  ];

export const ROSTER = {
  team1: ["Serena", "Ivan", "Ashton", "Stolei", "Tri"],
  team2: ["Lehar", "Camerin", "Jade", "Bethany", "Quixote"],
  team3: ["Nick", "Daniel", "Katie", "Jainam"],
  coach: "Dr. B",
} as const;
