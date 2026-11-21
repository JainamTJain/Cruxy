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
  BookRequest,
  Comment,
  Flashcard,
  Highlight,
  LibraryFile,
  Passage,
  Proposal,
  ResearchRun,
  SyncRun,
} from "@/lib/library/types";
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
  files: LibraryFile[];
  passages: Passage[];
  highlights: Highlight[];
  comments: Comment[];
  proposals: Proposal[];
  flashcards: Flashcard[];
  research_runs: ResearchRun[];
  book_requests: BookRequest[];
  sync_runs: SyncRun[];
  seeded_at: string;
  /** tech-admin reauth timestamp for reveal window */
  last_tech_reauth_at: string | null;
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
    files: [],
    passages: [],
    highlights: [],
    comments: [],
    proposals: [],
    flashcards: [],
    research_runs: [],
    book_requests: [],
    sync_runs: [],
    seeded_at: nowIso(),
    last_tech_reauth_at: null,
  };
}

let writeChain: Promise<void> = Promise.resolve();

function withLibraryDefaults(store: SampleStore): SampleStore {
  return {
    ...store,
    files: store.files ?? [],
    passages: store.passages ?? [],
    highlights: store.highlights ?? [],
    comments: store.comments ?? [],
    proposals: store.proposals ?? [],
    flashcards: store.flashcards ?? [],
    research_runs: store.research_runs ?? [],
    book_requests: store.book_requests ?? [],
    sync_runs: store.sync_runs ?? [],
  };
}

export async function readStore(): Promise<SampleStore> {
  await ensureDir();
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    return withLibraryDefaults(JSON.parse(raw) as SampleStore);
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
