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
  CardFsrsState,
  CardReview,
  CaseRoleRow,
  ClaimRow,
  CounterclaimRow,
  DeckOptIn,
  Flashcard,
  JudgeAttempt,
  ModeratorQuestion,
  OnePager,
  PhrasebookEntry,
  PracticeSpeakLog,
  QuestionAnswer,
  ReadingProgress,
  RoadmapStage,
  SocraticSession,
  SupportRow,
  TruthItem,
} from "@/lib/revision/types";
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
  // Track 3
  truth_items: TruthItem[];
  claims: ClaimRow[];
  supports: SupportRow[];
  counterclaims: CounterclaimRow[];
  case_roles: CaseRoleRow[];
  one_pagers: OnePager[];
  flashcards: Flashcard[];
  card_fsrs_states: CardFsrsState[];
  card_reviews: CardReview[];
  deck_opt_ins: DeckOptIn[];
  questions: ModeratorQuestion[];
  answers: QuestionAnswer[];
  roadmap_stages: RoadmapStage[];
  phrasebook_entries: PhrasebookEntry[];
  socratic_sessions: SocraticSession[];
  reading_progress: ReadingProgress[];
  practice_speak_logs: PracticeSpeakLog[];
  judge_attempts: JudgeAttempt[];
  map_reviews: {
    id: string;
    person_id: string;
    team_id: string;
    case_id: string;
    claim_id: string | null;
    kind: string;
    created_at: string;
  }[];
  drill_session_seen: Record<string, string[]>;
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

  const case12 = cases.find((c) => c.number === 12)!;
  const case9 = cases.find((c) => c.number === 9)!;
  const serena = people.find((p) => p.name === "Serena")!;
  const drB = people.find((p) => p.name === "Dr. B")!;

  // Minimal Team 1 Case 12 claim map + truth items for revision demos
  const claim1Id = randomUUID();
  const claim2Id = randomUUID();
  const claims: ClaimRow[] = [
    {
      id: claim1Id,
      team_id: t1.id,
      case_id: case12.id,
      text: "Platforms should treat medical misinformation with a least-restrictive tool first.",
      logic_line:
        "Because harm is serious but speech still carries moral weight, graduated remedies fit better than blanket bans.",
      ord: 0,
      citation_ids: [],
      created_at: nowIso(),
      created_by: serena.id,
    },
    {
      id: claim2Id,
      team_id: t1.id,
      case_id: case12.id,
      text: "Users retain a duty to seek reliable care; platforms should not displace clinical judgment.",
      logic_line:
        "Because clinicians are accountable for diagnoses, platform tools should route users toward care, not replace it.",
      ord: 1,
      citation_ids: [],
      created_at: nowIso(),
      created_by: serena.id,
    },
  ];

  const supports: SupportRow[] = [
    {
      id: randomUUID(),
      claim_id: claim1Id,
      team_id: t1.id,
      case_id: case12.id,
      text: "Least-restrictive remedies reduce collateral silencing of contested but good-faith speech.",
      logic_line: null,
      ord: 0,
      citation_ids: [],
      created_at: nowIso(),
      created_by: serena.id,
    },
    {
      id: randomUUID(),
      claim_id: claim1Id,
      team_id: t1.id,
      case_id: case12.id,
      text: "Escalating labels and friction still lets users see context.",
      logic_line: null,
      ord: 1,
      citation_ids: [],
      created_at: nowIso(),
      created_by: serena.id,
    },
    {
      id: randomUUID(),
      claim_id: claim1Id,
      team_id: t1.id,
      case_id: case12.id,
      text: "Blanket removal invites viewpoint-selection pressure without clear moral stop rules.",
      logic_line: null,
      ord: 2,
      citation_ids: [],
      created_at: nowIso(),
      created_by: serena.id,
    },
    {
      id: randomUUID(),
      claim_id: claim2Id,
      team_id: t1.id,
      case_id: case12.id,
      text: "Clinical standards require individual assessment platforms cannot perform.",
      logic_line: null,
      ord: 0,
      citation_ids: [],
      created_at: nowIso(),
      created_by: serena.id,
    },
    {
      id: randomUUID(),
      claim_id: claim2Id,
      team_id: t1.id,
      case_id: case12.id,
      text: "Routing to care respects patient autonomy better than platform verdicts.",
      logic_line: null,
      ord: 1,
      citation_ids: [],
      created_at: nowIso(),
      created_by: serena.id,
    },
    {
      id: randomUUID(),
      claim_id: claim2Id,
      team_id: t1.id,
      case_id: case12.id,
      text: "Displacing judgment blurs who is responsible when advice goes wrong.",
      logic_line: null,
      ord: 2,
      citation_ids: [],
      created_at: nowIso(),
      created_by: serena.id,
    },
  ];

  const counterclaims: CounterclaimRow[] = [
    {
      id: randomUUID(),
      team_id: t1.id,
      case_id: case12.id,
      text: "Opponents say delayed removal costs lives when viral falsehoods spread fast.",
      concede: "Speed of harm is a real moral weight.",
      distinguish:
        "We distinguish imminent concrete harm from contested guidance.",
      rebut:
        "Graduated tools can still act quickly on clear, high-risk falsehoods without a total speech ban.",
      citation_ids: [],
      created_at: nowIso(),
      created_by: serena.id,
    },
  ];

  const truth_items: TruthItem[] = [
    {
      id: randomUUID(),
      team_id: t1.id,
      case_id: case12.id,
      kind: "framework",
      text: "Least restrictive means: pick the mildest tool that still protects the value at stake.",
      citation_ids: [],
      status: "accepted",
      created_at: nowIso(),
      created_by: serena.id,
      updated_at: nowIso(),
    },
    {
      id: randomUUID(),
      team_id: t1.id,
      case_id: case12.id,
      kind: "fact",
      text: "Case set notes platforms can label, demote, or remove posts under different policies.",
      citation_ids: [],
      status: "accepted",
      created_at: nowIso(),
      created_by: serena.id,
      updated_at: nowIso(),
    },
    {
      id: randomUUID(),
      team_id: t1.id,
      case_id: case12.id,
      kind: "example",
      text: "A parent sees a viral 'home remedy' clip; a label linking to clinic guidance is a milder first step than deletion.",
      citation_ids: [],
      status: "accepted",
      created_at: nowIso(),
      created_by: serena.id,
      updated_at: nowIso(),
    },
    {
      id: randomUUID(),
      team_id: t1.id,
      case_id: case9.id,
      kind: "fact",
      text: "GEM case: resource allocation trade-offs between rare-disease research and common illnesses.",
      citation_ids: [],
      status: "accepted",
      created_at: nowIso(),
      created_by: serena.id,
      updated_at: nowIso(),
    },
  ];

  const case_roles: CaseRoleRow[] = [
    {
      id: randomUUID(),
      team_id: t1.id,
      case_id: case12.id,
      person_id: serena.id,
      role: "lead_1",
      created_at: nowIso(),
      created_by: serena.id,
    },
  ];

  const questions: ModeratorQuestion[] = [
    {
      id: randomUUID(),
      case_id: case12.id,
      text: "State your view and main reasons in one sentence.",
      type: "state_view",
      difficulty: 1,
      origin: "cruxy",
      origin_label: "Cruxy",
      status: "active",
      asked_at_tag: null,
      created_at: nowIso(),
      created_by: null,
    },
    {
      id: randomUUID(),
      case_id: case12.id,
      text: "What if the falsehood is about a time-sensitive treatment — does least-restrictive still hold?",
      type: "change_facts",
      difficulty: 3,
      origin: "dr_b",
      origin_label: "Dr. B",
      status: "active",
      asked_at_tag: null,
      created_at: nowIso(),
      created_by: drB.id,
    },
  ];

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
    truth_items,
    claims,
    supports,
    counterclaims,
    case_roles,
    one_pagers: [],
    flashcards: [],
    card_fsrs_states: [],
    card_reviews: [],
    deck_opt_ins: [],
    questions,
    answers: [],
    roadmap_stages: [],
    phrasebook_entries: [],
    socratic_sessions: [],
    reading_progress: [],
    practice_speak_logs: [],
    judge_attempts: [],
    map_reviews: [],
    drill_session_seen: {},
  };
}

function emptyTrack3(): Pick<
  SampleStore,
  | "truth_items"
  | "claims"
  | "supports"
  | "counterclaims"
  | "case_roles"
  | "one_pagers"
  | "flashcards"
  | "card_fsrs_states"
  | "card_reviews"
  | "deck_opt_ins"
  | "questions"
  | "answers"
  | "roadmap_stages"
  | "phrasebook_entries"
  | "socratic_sessions"
  | "reading_progress"
  | "practice_speak_logs"
  | "judge_attempts"
  | "map_reviews"
  | "drill_session_seen"
> {
  return {
    truth_items: [],
    claims: [],
    supports: [],
    counterclaims: [],
    case_roles: [],
    one_pagers: [],
    flashcards: [],
    card_fsrs_states: [],
    card_reviews: [],
    deck_opt_ins: [],
    questions: [],
    answers: [],
    roadmap_stages: [],
    phrasebook_entries: [],
    socratic_sessions: [],
    reading_progress: [],
    practice_speak_logs: [],
    judge_attempts: [],
    map_reviews: [],
    drill_session_seen: {},
  };
}

let writeChain: Promise<void> = Promise.resolve();

export async function readStore(): Promise<SampleStore> {
  await ensureDir();
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<SampleStore>;
    return { ...emptyTrack3(), ...parsed } as SampleStore;
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
