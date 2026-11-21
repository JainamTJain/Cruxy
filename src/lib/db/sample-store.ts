import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  CASE_TITLES,
  ROSTER,
  SAMPLE_MEMBER_STARTER,
  TOKENS,
} from "@/lib/constants";
import type {
  ActivityLogEntry,
  AiCall,
  AuthCode,
  CaseRow,
  Competition,
  Person,
  Team,
} from "@/lib/types";
import type {
  AttendanceRow,
  BankEntry,
  CardScore,
  FeedbackItem,
  GlossaryTerm,
  JudgeCard,
  JudgeRow,
  PracticeRound,
  PracticeSession,
  RecordingRow,
  RedoRow,
  RoundReport,
  SkillChart,
  SpeakerLabelConfirm,
  TalkAnalytics,
  TranscriptLine,
} from "@/lib/practice/types";
import { hashPasscode } from "@/lib/crypto/passcodes";
import { nowIso } from "@/lib/utils";

const DATA_DIR = path.join(process.cwd(), ".data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

export interface SampleStore {
  teams: Team[];
  people: Person[];
  auth_codes: AuthCode[];
  activity_log: ActivityLogEntry[];
  ai_calls: AiCall[];
  competitions: Competition[];
  cases: CaseRow[];
  seeded_at: string;
  /** tech-admin reauth timestamp for reveal window */
  last_tech_reauth_at: string | null;
  /** Track 5 Practice */
  practice_sessions: PracticeSession[];
  practice_rounds: PracticeRound[];
  attendance: AttendanceRow[];
  recordings: RecordingRow[];
  transcript_lines: TranscriptLine[];
  glossary: GlossaryTerm[];
  judges: JudgeRow[];
  judge_cards: JudgeCard[];
  card_scores: CardScore[];
  feedback_items: FeedbackItem[];
  redos: RedoRow[];
  bank_entries: BankEntry[];
  round_reports: RoundReport[];
  skill_charts: SkillChart[];
  speaker_confirms: SpeakerLabelConfirm[];
  talk_analytics: TalkAnalytics[];
  /** Guest judge tokens: hash → judge_id + round_id + expires */
  guest_judge_tokens: {
    token_hash: string;
    judge_id: string;
    round_id: string;
    expires_at: string;
  }[];
  /** Session code attempt lockouts */
  session_code_attempts: {
    key: string;
    failures: number;
    locked_until: string | null;
  }[];
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function emptyPerson(
  name: string,
  teamId: string | null,
  role: Person["role"],
): Person {
  return {
    id: randomUUID(),
    name,
    team_id: teamId,
    role,
    email: null,
    email_reminders_opt_in: false,
    digest_opt_in: false,
    consent_version: null,
    consent_at: null,
    recording_ok: false,
    voice_sample_path: null,
    first_run_checklist: {
      confirm_cases: false,
      open_reading: false,
      review_flashcards: false,
      answer_aloud: false,
      see_roadmap: false,
    },
    failed_attempts: 0,
    locked_until: null,
    last_sign_in_at: null,
    created_at: nowIso(),
    created_by: null,
  };
}

export async function buildSeedStore(): Promise<SampleStore> {
  const t1: Team = {
    id: randomUUID(),
    name: "Team 1",
    colour: TOKENS.team1,
    created_at: nowIso(),
  };
  const t2: Team = {
    id: randomUUID(),
    name: "Team 2",
    colour: TOKENS.team2,
    created_at: nowIso(),
  };
  const t3: Team = {
    id: randomUUID(),
    name: "Team 3",
    colour: TOKENS.team3,
    created_at: nowIso(),
  };

  const people: Person[] = [
    ...ROSTER.team1.map((n) => emptyPerson(n, t1.id, "member")),
    ...ROSTER.team2.map((n) => emptyPerson(n, t2.id, "member")),
    ...ROSTER.team3.map((n) =>
      emptyPerson(n, t3.id, n === "Jainam" ? "tech_admin" : "member"),
    ),
    emptyPerson(ROSTER.coach, null, "coach_admin"),
  ];

  const memberStarterHash =
    process.env.MEMBER_STARTER_CODE_HASH?.trim() ||
    (await hashPasscode(SAMPLE_MEMBER_STARTER));

  const auth_codes: AuthCode[] = [
    {
      id: randomUUID(),
      kind: "starter",
      person_id: null,
      hash: memberStarterHash,
      encrypted_copy: null,
      must_choose: false,
      set_at: nowIso(),
      last_revealed_at: null,
      created_at: nowIso(),
    },
  ];

  const adminHash = process.env.INITIAL_ADMIN_CODE_HASH?.trim();
  if (adminHash) {
    const jainam = people.find((p) => p.name === "Jainam");
    auth_codes.push({
      id: randomUUID(),
      kind: "admin",
      person_id: jainam?.id ?? null,
      hash: adminHash,
      encrypted_copy: null,
      must_choose: true,
      set_at: nowIso(),
      last_revealed_at: null,
      created_at: nowIso(),
    });
  }

  const competition: Competition = {
    id: randomUUID(),
    name: "California Regional",
    date: "2026-12-05",
    place: "UCSB",
    timings: {
      presentation_min: 7,
      presentation_max: 12,
      commentary_min: 5,
      commentary_max: 8,
      qa_min: 10,
      qa_max: 15,
    },
    created_at: nowIso(),
  };

  const cases: CaseRow[] = CASE_TITLES.map((c) => ({
    id: randomUUID(),
    number: c.number,
    title: c.title,
    case_set_page: null,
    crux: null,
    trap: null,
    closing_question: null,
    active: c.active,
    created_at: nowIso(),
  }));

  return {
    teams: [t1, t2, t3],
    people,
    auth_codes,
    activity_log: [],
    ai_calls: [],
    competitions: [competition],
    cases,
    seeded_at: nowIso(),
    last_tech_reauth_at: null,
    ...emptyPracticeTables(),
  };
}

function emptyPracticeTables(): Pick<
  SampleStore,
  | "practice_sessions"
  | "practice_rounds"
  | "attendance"
  | "recordings"
  | "transcript_lines"
  | "glossary"
  | "judges"
  | "judge_cards"
  | "card_scores"
  | "feedback_items"
  | "redos"
  | "bank_entries"
  | "round_reports"
  | "skill_charts"
  | "speaker_confirms"
  | "talk_analytics"
  | "guest_judge_tokens"
  | "session_code_attempts"
> {
  return {
    practice_sessions: [],
    practice_rounds: [],
    attendance: [],
    recordings: [],
    transcript_lines: [],
    glossary: [],
    judges: [],
    judge_cards: [],
    card_scores: [],
    feedback_items: [],
    redos: [],
    bank_entries: [],
    round_reports: [],
    skill_charts: [],
    speaker_confirms: [],
    talk_analytics: [],
    guest_judge_tokens: [],
    session_code_attempts: [],
  };
}

/** Backfill Track 5 tables on stores seeded before Track 5. */
export function ensurePracticeTables(store: SampleStore): SampleStore {
  const empty = emptyPracticeTables();
  for (const key of Object.keys(empty) as (keyof typeof empty)[]) {
    if (!Array.isArray(store[key])) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (store as any)[key] = empty[key];
    }
  }
  return store;
}

let writeChain: Promise<void> = Promise.resolve();

export async function readStore(): Promise<SampleStore> {
  await ensureDir();
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = ensurePracticeTables(JSON.parse(raw) as SampleStore);
    return parsed;
  } catch {
    const seeded = await buildSeedStore();
    await fs.writeFile(STORE_PATH, JSON.stringify(seeded, null, 2));
    return seeded;
  }
}

export async function writeStore(store: SampleStore): Promise<void> {
  writeChain = writeChain.then(async () => {
    await ensureDir();
    await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2));
  });
  await writeChain;
}

export async function updateStore(
  mutator: (store: SampleStore) => void | Promise<void>,
): Promise<SampleStore> {
  const store = await readStore();
  await mutator(store);
  await writeStore(store);
  return store;
}

export async function resetSampleStore(): Promise<SampleStore> {
  const seeded = await buildSeedStore();
  await writeStore(seeded);
  return seeded;
}
