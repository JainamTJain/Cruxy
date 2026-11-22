import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  CASE_TITLES,
  COACH_PERSON_ID,
  MONTHLY_CAP_USD_DEFAULT,
  PER_PERSON_ASSISTANT_DAY_CAP_USD,
  PER_RESEARCH_NIGHT_CAP_USD,
  PER_ROUND_CAP_USD,
  ROSTER,
  SAMPLE_COACH_STARTER,
  SAMPLE_MEMBER_STARTER,
  TOKENS,
} from "@/lib/constants";
import { buildContentSeed } from "@/lib/seed/build-content";
import { buildPracticeFixtures } from "@/lib/practice/seed-fixtures";
import {
  caseId,
  SEED_PERSON_IDS,
  SEED_TEAM_IDS,
} from "@/lib/seed/ids";
import { buildTeamSpaceSeed } from "@/lib/team/seed";
import type { CaseStakeholderSeed } from "@/lib/seed/build-content";
import type { ScoringCardItemSeed } from "@/lib/seed/scoring-card";
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
  CalibrationRow,
  CaseRow,
  Competition,
  CompetitionLogEntry,
  DriveSortItem,
  Person,
  ProgramTotals,
  ReadinessCell,
  SpendCaps,
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
  NodeMastery,
  OnePager,
  PhrasebookEntry,
  PracticeSpeakLog,
  QuestionAnswer,
  ReadingProgress,
  RoadmapStage,
  SocraticSession,
} from "@/lib/revision/types";
import type {
  AlignmentQuestionSet,
  Assignment,
  ChatChannel,
  ChatMessage,
  ClaimChangeProposal,
  ClaimMapConfirmation,
  ClaimMapVersion,
  DriftFlag,
  PersonPrefs,
} from "@/lib/team/types";
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
  /** Shared by Track 3 (stage ids) and Track 4 (role:… stages). */
  roadmap_stages: Array<
    Omit<RoadmapStage, "stage" | "created_by"> & {
      stage: string;
      created_by?: string | null;
    }
  >;
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
  /** Track 4 Team space */
  assignments: Assignment[];
  chats: ChatChannel[];
  messages: ChatMessage[];
  claim_map_versions: ClaimMapVersion[];
  claim_map_confirmations: ClaimMapConfirmation[];
  claim_change_proposals: ClaimChangeProposal[];
  alignment_questions: AlignmentQuestionSet[];
  drift_flags: DriftFlag[];
  person_prefs: PersonPrefs[];
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
  guest_judge_tokens: {
    token_hash: string;
    judge_id: string;
    round_id: string;
    expires_at: string;
  }[];
  session_code_attempts: {
    key: string;
    failures: number;
    locked_until: string | null;
  }[];
  /** Sample-mode admin plaintext session codes (never exposed except via admin API). */
  session_admin_codes: Record<string, string>;
  /** Track 6 Admin */
  readiness: ReadinessCell[];
  program_totals: ProgramTotals;
  spend_caps: SpendCaps;
  drive_sort_queue: DriveSortItem[];
  calibration: CalibrationRow[];
  competition_logs: CompetitionLogEntry[];
  feature_useful: { feature: string; person_id: string; at: string }[];
  last_visits: Record<string, string>;
  /** Workstream B content extras */
  case_stakeholders: CaseStakeholderSeed[];
  scoring_card_items: ScoringCardItemSeed[];
  /** Workstream E Wave 5: team-editable roadmap deadlines */
  roadmap_deadline_overrides: {
    id: string;
    team_id: string;
    stage: string;
    due: string;
    updated_at: string;
    updated_by: string | null;
  }[];
  /** Workstream F Wave 6: per-person claim-node mastery from card reviews */
  node_mastery: NodeMastery[];
  /** Wave 6 E: mastery map grid cache (migration 00033). */
  mastery_map_cells: {
    id: string;
    person_id: string;
    team_id: string | null;
    case_id: string;
    node_kind: string;
    node_id: string;
    mastery: number;
    evidence: Record<string, number>;
    updated_at: string;
  }[];
  /** Workstream K Wave 6: argument graph (recordEdge). Optional until seeded/backfilled. */
  arg_edges?: import("@/lib/graph/types").ArgEdge[];
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

function emptyTeamSpaceFields(): Pick<
  SampleStore,
  | "assignments"
  | "chats"
  | "messages"
  | "claim_map_versions"
  | "claim_map_confirmations"
  | "claim_change_proposals"
  | "alignment_questions"
  | "drift_flags"
  | "person_prefs"
> {
  return {
    assignments: [],
    chats: [],
    messages: [],
    claim_map_versions: [],
    claim_map_confirmations: [],
    claim_change_proposals: [],
    alignment_questions: [],
    drift_flags: [],
    person_prefs: [],
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
  | "session_admin_codes"
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
    session_admin_codes: {},
  };
}

function emptyAdminFields(): Pick<
  SampleStore,
  | "readiness"
  | "program_totals"
  | "spend_caps"
  | "drive_sort_queue"
  | "calibration"
  | "competition_logs"
  | "feature_useful"
  | "last_visits"
  | "roadmap_deadline_overrides"
  | "node_mastery"
  | "mastery_map_cells"
> {
  return {
    readiness: [],
    program_totals: {
      drive_files: 0,
      passages_cited: 0,
      ideas_accepted: 0,
      sources_verified: 0,
      bank_questions: 0,
      rounds_graded: 0,
      redo_improvements: 0,
    },
    spend_caps: {
      monthly_usd: MONTHLY_CAP_USD_DEFAULT,
      per_round_usd: PER_ROUND_CAP_USD,
      per_research_night_usd: PER_RESEARCH_NIGHT_CAP_USD,
      per_person_assistant_day_usd: PER_PERSON_ASSISTANT_DAY_CAP_USD,
      research_paused: false,
      updated_at: nowIso(),
      updated_by: null,
    },
    roadmap_deadline_overrides: [],
    node_mastery: [],
    mastery_map_cells: [],
    drive_sort_queue: [],
    calibration: [],
    competition_logs: [],
    feature_useful: [],
    last_visits: {},
  };
}

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function emptyPerson(
  name: string,
  teamId: string | null,
  role: Person["role"],
  id?: string,
): Person {
  return {
    id: id ?? randomUUID(),
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
    pronunciation_note: null,
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

function personWithId(
  id: string,
  name: string,
  teamId: string | null,
  role: Person["role"],
): Person {
  return { ...emptyPerson(name, teamId, role), id };
}

export async function buildSeedStore(): Promise<SampleStore> {
  const now = nowIso();
  const t1: Team = {
    id: SEED_TEAM_IDS.team1,
    name: "Team 1",
    colour: TOKENS.team1,
    created_at: now,
  };
  const t2: Team = {
    id: SEED_TEAM_IDS.team2,
    name: "Team 2",
    colour: TOKENS.team2,
    created_at: now,
  };
  const t3: Team = {
    id: SEED_TEAM_IDS.team3,
    name: "Team 3",
    colour: TOKENS.team3,
    created_at: now,
  };

  const people: Person[] = [
    ...ROSTER.team1.map((n) =>
      personWithId(SEED_PERSON_IDS[n], n, t1.id, "member"),
    ),
    ...ROSTER.team2.map((n) =>
      personWithId(SEED_PERSON_IDS[n], n, t2.id, "member"),
    ),
    ...ROSTER.team3.map((n) =>
      personWithId(
        SEED_PERSON_IDS[n],
        n,
        t3.id,
        n === "Jainam" ? "tech_admin" : "member",
      ),
    ),
    personWithId(SEED_PERSON_IDS["Dr. B"], ROSTER.coach, null, "coach_admin"),
  ];

  const memberStarterHash =
    process.env.MEMBER_STARTER_CODE_HASH?.trim() ||
    (await hashPasscode(SAMPLE_MEMBER_STARTER));
  const coachStarterHash =
    process.env.COACH_STARTER_CODE_HASH?.trim() ||
    (await hashPasscode(SAMPLE_COACH_STARTER));

  const auth_codes: AuthCode[] = [
    {
      id: "auth0000-0000-4000-8000-000000000001",
      kind: "starter",
      person_id: null,
      hash: memberStarterHash,
      encrypted_copy: null,
      must_choose: false,
      set_at: now,
      last_revealed_at: null,
      created_at: now,
    },
    {
      id: randomUUID(),
      kind: "starter",
      person_id: COACH_PERSON_ID,
      hash: coachStarterHash,
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
      id: "auth0000-0000-4000-8000-000000000002",
      kind: "admin",
      person_id: jainam?.id ?? null,
      hash: adminHash,
      encrypted_copy: null,
      must_choose: true,
      set_at: now,
      last_revealed_at: null,
      created_at: now,
    });
  }

  const competition: Competition = {
    id: "b0000000-0000-4000-8000-000000000001",
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
    created_at: now,
  };

  // Workstream B: real content from docs/domain/cases
  const content = await buildContentSeed(process.cwd());
  // Workstream E: claim maps, team chat, gaps, Case 9 v7
  const teamSpace = buildTeamSpaceSeed({
    onePagers: content.one_pagers,
    caseRoles: content.case_roles,
  });

  // Ensure CASE_TITLES inactive flags and Case 10 title stay authoritative
  const cases: CaseRow[] = content.cases.map((c) => {
    const meta = CASE_TITLES.find((t) => t.number === c.number)!;
    return {
      ...c,
      id: caseId(c.number),
      title: meta.title,
      active: meta.active,
    };
  });

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
    claims: content.claims,
    supports: content.supports,
    backings: content.backings,
    counterclaims: content.counterclaims,
    truth_items: content.truth_items,
    proposals: content.proposals,
    case_roles: teamSpace.case_roles,
    opposing_positions: content.opposing_positions,
    seeded_at: now,
    last_tech_reauth_at: null,
    ...emptyTrack3Fields(),
    flashcards: content.flashcards,
    one_pagers: content.one_pagers,
    questions: content.questions,
    deck_opt_ins: content.deck_opt_ins,
    ...emptyTeamSpaceFields(),
    assignments: [],
    chats: teamSpace.chats,
    messages: teamSpace.messages,
    claim_map_versions: teamSpace.claim_map_versions,
    claim_map_confirmations: teamSpace.claim_map_confirmations,
    claim_change_proposals: [],
    alignment_questions: teamSpace.alignment_questions,
    drift_flags: [],
    person_prefs: [],
    ...emptyPracticeTables(),
    ...(await buildPracticeFixtures()),
    glossary: [],
    speaker_confirms: [],
    ...emptyAdminFields(),
    case_stakeholders: content.stakeholders,
    scoring_card_items: content.scoring_card_items,
    program_totals: {
      drive_files: 0,
      passages_cited: 0,
      ideas_accepted: 0,
      sources_verified: content.truth_items.length,
      bank_questions: content.questions.length,
      rounds_graded: 1,
      redo_improvements: 0,
    },
  };
}

function migrateStoreShape(raw: Partial<SampleStore>): SampleStore {
  const brain = emptyCaseBrainFields();
  const library = emptyLibraryFields();
  const track3 = emptyTrack3Fields();
  const team = emptyTeamSpaceFields();
  const practice = emptyPracticeTables();
  const admin = emptyAdminFields();
  return {
    teams: raw.teams ?? [],
    people: raw.people ?? [],
    auth_codes: raw.auth_codes ?? [],
    activity_log: raw.activity_log ?? [],
    ai_calls: raw.ai_calls ?? [],
    competitions: raw.competitions ?? [],
    cases: raw.cases ?? [],
    files: (raw.files ?? library.files).map((f) => ({
      ...f,
      unreadable_reason: f.unreadable_reason ?? null,
    })),
    passages: raw.passages ?? library.passages,
    highlights: raw.highlights ?? library.highlights,
    comments: raw.comments ?? library.comments,
    flashcards: (raw.flashcards ?? library.flashcards).map((c) => ({
      ...c,
      claim_id: c.claim_id ?? null,
    })),
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
    assignments: raw.assignments ?? team.assignments,
    chats: raw.chats ?? team.chats,
    messages: raw.messages ?? team.messages,
    claim_map_versions: raw.claim_map_versions ?? team.claim_map_versions,
    claim_map_confirmations:
      raw.claim_map_confirmations ?? team.claim_map_confirmations,
    claim_change_proposals:
      raw.claim_change_proposals ?? team.claim_change_proposals,
    alignment_questions: raw.alignment_questions ?? team.alignment_questions,
    drift_flags: raw.drift_flags ?? team.drift_flags,
    person_prefs: raw.person_prefs ?? team.person_prefs,
    practice_sessions: raw.practice_sessions ?? practice.practice_sessions,
    practice_rounds: raw.practice_rounds ?? practice.practice_rounds,
    attendance: raw.attendance ?? practice.attendance,
    recordings: raw.recordings ?? practice.recordings,
    transcript_lines: raw.transcript_lines ?? practice.transcript_lines,
    glossary: raw.glossary ?? practice.glossary,
    judges: raw.judges ?? practice.judges,
    judge_cards: raw.judge_cards ?? practice.judge_cards,
    card_scores: raw.card_scores ?? practice.card_scores,
    feedback_items: raw.feedback_items ?? practice.feedback_items,
    redos: raw.redos ?? practice.redos,
    bank_entries: raw.bank_entries ?? practice.bank_entries,
    round_reports: raw.round_reports ?? practice.round_reports,
    skill_charts: raw.skill_charts ?? practice.skill_charts,
    speaker_confirms: raw.speaker_confirms ?? practice.speaker_confirms,
    talk_analytics: raw.talk_analytics ?? practice.talk_analytics,
    guest_judge_tokens: raw.guest_judge_tokens ?? practice.guest_judge_tokens,
    session_code_attempts:
      raw.session_code_attempts ?? practice.session_code_attempts,
    session_admin_codes:
      raw.session_admin_codes ?? practice.session_admin_codes,
    readiness: raw.readiness ?? admin.readiness,
    program_totals: raw.program_totals ?? admin.program_totals,
    spend_caps: raw.spend_caps ?? admin.spend_caps,
    drive_sort_queue: raw.drive_sort_queue ?? admin.drive_sort_queue,
    calibration: raw.calibration ?? admin.calibration,
    competition_logs: raw.competition_logs ?? admin.competition_logs,
    feature_useful: raw.feature_useful ?? admin.feature_useful,
    last_visits: raw.last_visits ?? admin.last_visits,
    case_stakeholders: raw.case_stakeholders ?? [],
    scoring_card_items: raw.scoring_card_items ?? [],
    roadmap_deadline_overrides:
      raw.roadmap_deadline_overrides ?? admin.roadmap_deadline_overrides ?? [],
    node_mastery: raw.node_mastery ?? admin.node_mastery ?? [],
    mastery_map_cells:
      raw.mastery_map_cells ?? admin.mastery_map_cells ?? [],
    arg_edges: raw.arg_edges ?? [],
  };
}

let writeChain: Promise<void> = Promise.resolve();

export async function readStore(): Promise<SampleStore> {
  await ensureDir();
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const store = migrateStoreShape(JSON.parse(raw) as Partial<SampleStore>);
    // Workstream D: inject practice design fixtures when an older store has none.
    if (store.practice_sessions.length === 0) {
      const fixtures = await buildPracticeFixtures();
      Object.assign(store, fixtures);
      store.glossary = store.glossary ?? [];
      store.speaker_confirms = store.speaker_confirms ?? [];
      // Fixture practice day assumes voice consent for seated members.
      for (const p of store.people) {
        if (p.role === "member" || p.role === "tech_admin") {
          p.recording_ok = true;
          p.consent_version = p.consent_version ?? "2026-11-21-v1";
          p.consent_at = p.consent_at ?? "2026-11-01T00:00:00.000Z";
        }
      }
      await fs.writeFile(STORE_PATH, JSON.stringify(store, null, 2));
    }
    return store;
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
