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
  Backing,
  CaseRole,
  ChangeTheFactsItem,
  Claim,
  Counterclaim,
  Decision,
  ItemHistoryEntry,
  OpposingPosition,
  Proposal,
  Support,
  TeamPrinciple,
  TruthItem,
} from "@/lib/case-brain/types";
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
  ResearchRun,
  SyncRun,
} from "@/lib/library/types";
import type {
  CardFsrsState,
  CardReview,
  DeckOptIn,
  JudgeAttempt,
  ModeratorQuestion,
  OnePager,
  PhrasebookEntry,
  PracticeSpeakLog,
  QuestionAnswer,
  ReadingProgress,
  RoadmapStage,
  SocraticSession,
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
  /** Track 1 Library */
  files: LibraryFile[];
  passages: Passage[];
  highlights: Highlight[];
  comments: Comment[];
  flashcards: Flashcard[];
  research_runs: ResearchRun[];
  book_requests: BookRequest[];
  sync_runs: SyncRun[];
  /** Track 2 Case brain (proposals shared with Library research/reading) */
  claims: Claim[];
  supports: Support[];
  backings: Backing[];
  counterclaims: Counterclaim[];
  truth_items: TruthItem[];
  proposals: Proposal[];
  decisions: Decision[];
  case_roles: CaseRole[];
  opposing_positions: OpposingPosition[];
  item_history: ItemHistoryEntry[];
  team_principles: TeamPrinciple[];
  change_the_facts: ChangeTheFactsItem[];
  seeded_at: string;
  /** tech-admin reauth timestamp for reveal window */
  last_tech_reauth_at: string | null;
  /** Track 3 Revision */
  one_pagers: OnePager[];
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

function emptyCaseBrainFields(): Pick<
  SampleStore,
  | "claims"
  | "supports"
  | "backings"
  | "counterclaims"
  | "truth_items"
  | "proposals"
  | "decisions"
  | "case_roles"
  | "opposing_positions"
  | "item_history"
  | "team_principles"
  | "change_the_facts"
> {
  return {
    claims: [],
    supports: [],
    backings: [],
    counterclaims: [],
    truth_items: [],
    proposals: [],
    decisions: [],
    case_roles: [],
    opposing_positions: [],
    item_history: [],
    team_principles: [],
    change_the_facts: [],
  };
}

function emptyLibraryFields(): Pick<
  SampleStore,
  | "files"
  | "passages"
  | "highlights"
  | "comments"
  | "flashcards"
  | "research_runs"
  | "book_requests"
  | "sync_runs"
> {
  return {
    files: [],
    passages: [],
    highlights: [],
    comments: [],
    flashcards: [],
    research_runs: [],
    book_requests: [],
    sync_runs: [],
  };
}

function emptyTrack3Fields(): Pick<
  SampleStore,
  | "one_pagers"
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
    one_pagers: [],
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
  const now = nowIso();

  const claim1Id = randomUUID();
  const claim2Id = randomUUID();
  const claims: Claim[] = [
    {
      id: claim1Id,
      team_id: t1.id,
      case_id: case12.id,
      text: "Platforms should treat medical misinformation with a least-restrictive tool first.",
      logic_line:
        "Because harm is serious but speech still carries moral weight, graduated remedies fit better than blanket bans.",
      ord: 0,
      citation_ids: [],
      created_at: now,
      created_by: serena.id,
      updated_at: now,
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
      created_at: now,
      created_by: serena.id,
      updated_at: now,
    },
  ];

  const supports: Support[] = [
    {
      id: randomUUID(),
      claim_id: claim1Id,
      team_id: t1.id,
      case_id: case12.id,
      text: "Least-restrictive remedies reduce collateral silencing of contested but good-faith speech.",
      logic_line: null,
      ord: 0,
      citation_ids: [],
      created_at: now,
      created_by: serena.id,
      updated_at: now,
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
      created_at: now,
      created_by: serena.id,
      updated_at: now,
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
      created_at: now,
      created_by: serena.id,
      updated_at: now,
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
      created_at: now,
      created_by: serena.id,
      updated_at: now,
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
      created_at: now,
      created_by: serena.id,
      updated_at: now,
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
      created_at: now,
      created_by: serena.id,
      updated_at: now,
    },
  ];

  const counterclaims: Counterclaim[] = [
    {
      id: randomUUID(),
      team_id: t1.id,
      case_id: case12.id,
      claim_id: claim1Id,
      text: "Opponents say delayed removal costs lives when viral falsehoods spread fast.",
      concede: "Speed of harm is a real moral weight.",
      distinguish:
        "We distinguish imminent concrete harm from contested guidance.",
      rebut:
        "Graduated tools can still act quickly on clear, high-risk falsehoods without a total speech ban.",
      citation_ids: [],
      created_at: now,
      created_by: serena.id,
      updated_at: now,
    },
    {
      id: randomUUID(),
      team_id: t1.id,
      case_id: case12.id,
      claim_id: claim2Id,
      text: "Opponents say platforms already act as de facto clinicians when they recommend content.",
      concede: "Recommendation systems shape what people see.",
      distinguish:
        "Routing to care is different from issuing a diagnosis or treatment plan.",
      rebut:
        "We keep clinicians accountable and use platform tools only to point toward care.",
      citation_ids: [],
      created_at: now,
      created_by: serena.id,
      updated_at: now,
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
      created_at: now,
      created_by: serena.id,
      updated_at: now,
    },
    {
      id: randomUUID(),
      team_id: t1.id,
      case_id: case12.id,
      kind: "fact",
      text: "Case set notes platforms can label, demote, or remove posts under different policies.",
      citation_ids: [],
      status: "accepted",
      created_at: now,
      created_by: serena.id,
      updated_at: now,
    },
    {
      id: randomUUID(),
      team_id: t1.id,
      case_id: case12.id,
      kind: "example",
      text: "A parent sees a viral 'home remedy' clip; a label linking to clinic guidance is a milder first step than deletion.",
      citation_ids: [],
      status: "accepted",
      created_at: now,
      created_by: serena.id,
      updated_at: now,
    },
    {
      id: randomUUID(),
      team_id: t1.id,
      case_id: case9.id,
      kind: "fact",
      text: "GEM case: resource allocation trade-offs between rare-disease research and common illnesses.",
      citation_ids: [],
      status: "accepted",
      created_at: now,
      created_by: serena.id,
      updated_at: now,
    },
  ];

  const case_roles: CaseRole[] = [
    {
      id: randomUUID(),
      team_id: t1.id,
      case_id: case12.id,
      person_id: serena.id,
      role: "lead_1",
      created_at: now,
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
      created_at: now,
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
      created_at: now,
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
    ...emptyLibraryFields(),
    ...emptyCaseBrainFields(),
    claims,
    supports,
    counterclaims,
    truth_items,
    case_roles,
    seeded_at: now,
    last_tech_reauth_at: null,
    ...emptyTrack3Fields(),
    questions,
  };
}

function migrateStoreShape(raw: Partial<SampleStore>): SampleStore {
  const brain = emptyCaseBrainFields();
  const library = emptyLibraryFields();
  const track3 = emptyTrack3Fields();
  return {
    teams: raw.teams ?? [],
    people: raw.people ?? [],
    auth_codes: raw.auth_codes ?? [],
    activity_log: raw.activity_log ?? [],
    ai_calls: raw.ai_calls ?? [],
    competitions: raw.competitions ?? [],
    cases: raw.cases ?? [],
    files: raw.files ?? library.files,
    passages: raw.passages ?? library.passages,
    highlights: raw.highlights ?? library.highlights,
    comments: raw.comments ?? library.comments,
    flashcards: raw.flashcards ?? library.flashcards,
    research_runs: raw.research_runs ?? library.research_runs,
    book_requests: raw.book_requests ?? library.book_requests,
    sync_runs: raw.sync_runs ?? library.sync_runs,
    claims: raw.claims ?? brain.claims,
    supports: raw.supports ?? brain.supports,
    backings: raw.backings ?? brain.backings,
    counterclaims: raw.counterclaims ?? brain.counterclaims,
    truth_items: raw.truth_items ?? brain.truth_items,
    proposals: raw.proposals ?? brain.proposals,
    decisions: raw.decisions ?? brain.decisions,
    case_roles: raw.case_roles ?? brain.case_roles,
    opposing_positions: raw.opposing_positions ?? brain.opposing_positions,
    item_history: raw.item_history ?? brain.item_history,
    team_principles: raw.team_principles ?? brain.team_principles,
    change_the_facts: raw.change_the_facts ?? brain.change_the_facts,
    seeded_at: raw.seeded_at ?? nowIso(),
    last_tech_reauth_at: raw.last_tech_reauth_at ?? null,
    one_pagers: raw.one_pagers ?? track3.one_pagers,
    card_fsrs_states: raw.card_fsrs_states ?? track3.card_fsrs_states,
    card_reviews: raw.card_reviews ?? track3.card_reviews,
    deck_opt_ins: raw.deck_opt_ins ?? track3.deck_opt_ins,
    questions: raw.questions ?? track3.questions,
    answers: raw.answers ?? track3.answers,
    roadmap_stages: raw.roadmap_stages ?? track3.roadmap_stages,
    phrasebook_entries: raw.phrasebook_entries ?? track3.phrasebook_entries,
    socratic_sessions: raw.socratic_sessions ?? track3.socratic_sessions,
    reading_progress: raw.reading_progress ?? track3.reading_progress,
    practice_speak_logs: raw.practice_speak_logs ?? track3.practice_speak_logs,
    judge_attempts: raw.judge_attempts ?? track3.judge_attempts,
    map_reviews: raw.map_reviews ?? track3.map_reviews,
    drill_session_seen: raw.drill_session_seen ?? track3.drill_session_seen,
  };
}

let writeChain: Promise<void> = Promise.resolve();

export async function readStore(): Promise<SampleStore> {
  await ensureDir();
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    return migrateStoreShape(JSON.parse(raw) as Partial<SampleStore>);
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
