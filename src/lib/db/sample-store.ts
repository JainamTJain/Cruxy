import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  CASE_TITLES,
  MONTHLY_CAP_USD_DEFAULT,
  PER_PERSON_ASSISTANT_DAY_CAP_USD,
  PER_RESEARCH_NIGHT_CAP_USD,
  PER_ROUND_CAP_USD,
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
  /** Track 6 Admin */
  readiness: ReadinessCell[];
  program_totals: ProgramTotals;
  spend_caps: SpendCaps;
  drive_sort_queue: DriveSortItem[];
  calibration: CalibrationRow[];
  competition_logs: CompetitionLogEntry[];
  feature_useful: { feature: string; person_id: string; at: string }[];
  last_visits: Record<string, string>;
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

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
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

  // Sample consent / sign-in state matching baseline screens
  const markRecorded = (name: string, withVoice = true) => {
    const p = people.find((x) => x.name === name);
    if (!p) return;
    p.consent_version = "2026-11-21-v1";
    p.consent_at = daysAgo(10);
    p.recording_ok = true;
    p.voice_sample_path = withVoice ? `sample://${name.toLowerCase()}.webm` : null;
    p.last_sign_in_at = daysAgo(0);
  };
  for (const n of [
    "Serena",
    "Ivan",
    "Ashton",
    "Tri",
    "Lehar",
    "Camerin",
    "Bethany",
    "Quixote",
    "Nick",
    "Daniel",
    "Katie",
    "Jainam",
  ]) {
    markRecorded(n);
  }
  const jade = people.find((p) => p.name === "Jade");
  if (jade) {
    jade.consent_version = "2026-11-21-v1";
    jade.consent_at = daysAgo(8);
    jade.recording_ok = false;
    jade.last_sign_in_at = daysAgo(1);
  }
  // Stolei hasn't signed in
  const drB = people.find((p) => p.name === "Dr. B");
  if (drB) {
    drB.email = "drb@example.edu";
    drB.digest_opt_in = true;
    drB.consent_version = "2026-11-21-v1";
    drB.consent_at = daysAgo(20);
    drB.recording_ok = true;
    drB.last_sign_in_at = daysAgo(0);
  }
  const jainam = people.find((p) => p.name === "Jainam");
  if (jainam) {
    jainam.email = "jainam@example.edu";
    jainam.digest_opt_in = true;
  }

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

  const activeCases = cases.filter((c) => c.active);
  const leadsByTeam: Record<string, string[][]> = {
    [t1.id]: [
      ["Serena", "Ivan"],
      ["Ashton", "Tri"],
      ["Ivan", "Stolei"],
    ],
    [t2.id]: [
      ["Lehar", "Camerin"],
      ["Jade", "Bethany"],
      ["Quixote", "Lehar"],
    ],
    [t3.id]: [
      ["Nick", "Katie"],
      ["Daniel", "Jainam"],
      ["Katie", "Nick"],
    ],
  };

  const readiness: ReadinessCell[] = [];
  for (const team of [t1, t2, t3]) {
    const base =
      team.id === t1.id ? 51 : team.id === t2.id ? 54 : 52;
    activeCases.forEach((c, i) => {
      const jitter = ((i * 7) % 17) - 8;
      const pct = Math.max(12, Math.min(92, base + jitter));
      const leads = leadsByTeam[team.id][i % 3] ?? ["—"];
      readiness.push({
        id: randomUUID(),
        team_id: team.id,
        case_id: c.id,
        readiness_pct: pct,
        lead_names: leads,
        latest_event:
          i === 0
            ? `${team.name} graded ${40 + (i % 12)}/60 yesterday`
            : i === 3
              ? `Truth Sources +${1 + (i % 3)} this week`
              : null,
        updated_at: daysAgo(i % 4),
      });
    });
  }

  const sampleCalls: AiCall[] = [
    {
      id: randomUUID(),
      feature: "judging",
      model: "strong:stub",
      tokens_in: 12000,
      tokens_out: 1800,
      cost_usd: 6.8,
      person_id: jainam?.id ?? null,
      refused: false,
      refuse_reason: null,
      created_at: daysAgo(2),
    },
    {
      id: randomUUID(),
      feature: "research",
      model: "flash:stub",
      tokens_in: 8000,
      tokens_out: 900,
      cost_usd: 2.9,
      person_id: null,
      refused: false,
      refuse_reason: null,
      created_at: daysAgo(1),
    },
    {
      id: randomUUID(),
      feature: "assistant",
      model: "flash:stub",
      tokens_in: 2200,
      tokens_out: 400,
      cost_usd: 1.7,
      person_id: people.find((p) => p.name === "Serena")?.id ?? null,
      refused: false,
      refuse_reason: null,
      created_at: daysAgo(0),
    },
  ];

  const activity_log: ActivityLogEntry[] = [
    {
      id: randomUUID(),
      person_id: jainam?.id ?? null,
      action: "seed_ready",
      target: "track6",
      meta: { note: "sample program seeded" },
      ip_hash: null,
      at: daysAgo(0),
    },
    {
      id: randomUUID(),
      person_id: people.find((p) => p.name === "Serena")?.id ?? null,
      action: "truth_accepted",
      target: "case-7",
      meta: { claim: "repair, not payout" },
      ip_hash: null,
      at: daysAgo(0),
    },
    {
      id: randomUUID(),
      person_id: people.find((p) => p.name === "Daniel")?.id ?? null,
      action: "truth_rejected",
      target: "case-3",
      meta: { claim: "Unit 731 example" },
      ip_hash: null,
      at: daysAgo(0),
    },
  ];

  return {
    teams: [t1, t2, t3],
    people,
    auth_codes,
    activity_log,
    ai_calls: sampleCalls,
    competitions: [competition],
    cases,
    readiness,
    program_totals: {
      drive_files: 142,
      passages_cited: 860,
      ideas_accepted: 47,
      sources_verified: 31,
      bank_questions: 58,
      rounds_graded: 12,
      redo_improvements: 9,
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
    drive_sort_queue: [
      {
        id: randomUUID(),
        filename: "notes final v2.docx",
        hint: "Case 10 or 11?",
        confidence: 0.55,
        status: "pending",
        created_at: daysAgo(1),
      },
    ],
    calibration: [
      {
        id: randomUUID(),
        label: "Cruxy vs judges, Presentation A",
        gap: -0.6,
        judge_name: "Prof. Sample",
        weight: 1.2,
        human_cards: 9,
        created_at: daysAgo(4),
      },
      {
        id: randomUUID(),
        label: "Cruxy vs judges, Response to judges",
        gap: -1.1,
        judge_name: "Prof. Sample",
        weight: 1.2,
        human_cards: 9,
        created_at: daysAgo(4),
      },
    ],
    competition_logs: [],
    feature_useful: [],
    last_visits: {},
    ...emptyLibraryFields(),
    book_requests: [
      {
        id: randomUUID(),
        title: "Who Owns Antiquity?",
        reason: "Case 9 context",
        chapter: "ch. 3",
        case_id: cases.find((c) => c.number === 9)?.id ?? null,
        status: "open",
        created_at: daysAgo(3),
        created_by: jainam?.id ?? null,
      },
      {
        id: randomUUID(),
        title: "The Harm in Hate Speech",
        reason: "Case 13",
        chapter: null,
        case_id: cases.find((c) => c.number === 13)?.id ?? null,
        status: "open",
        created_at: daysAgo(5),
        created_by: jainam?.id ?? null,
      },
    ],
    ...emptyCaseBrainFields(),
    seeded_at: nowIso(),
    last_tech_reauth_at: null,
  };
}

let writeChain: Promise<void> = Promise.resolve();

function migrateStore(raw: SampleStore): SampleStore {
  // Older stores may lack Track 2 / Track 6 fields — fill defaults without wiping.
  if (!raw.program_totals) {
    raw.program_totals = {
      drive_files: 0,
      passages_cited: 0,
      ideas_accepted: 0,
      sources_verified: 0,
      bank_questions: 0,
      rounds_graded: 0,
      redo_improvements: 0,
    };
  }
  if (!raw.readiness) raw.readiness = [];
  if (!raw.spend_caps) {
    raw.spend_caps = {
      monthly_usd: MONTHLY_CAP_USD_DEFAULT,
      per_round_usd: PER_ROUND_CAP_USD,
      per_research_night_usd: PER_RESEARCH_NIGHT_CAP_USD,
      per_person_assistant_day_usd: PER_PERSON_ASSISTANT_DAY_CAP_USD,
      research_paused: false,
      updated_at: nowIso(),
      updated_by: null,
    };
  }
  if (!raw.book_requests) raw.book_requests = [];
  if (!raw.drive_sort_queue) raw.drive_sort_queue = [];
  if (!raw.calibration) raw.calibration = [];
  if (!raw.competition_logs) raw.competition_logs = [];
  if (!raw.feature_useful) raw.feature_useful = [];
  if (!raw.last_visits) raw.last_visits = {};

  const brain = emptyCaseBrainFields();
  const library = emptyLibraryFields();
  raw.files = raw.files ?? library.files;
  raw.passages = raw.passages ?? library.passages;
  raw.highlights = raw.highlights ?? library.highlights;
  raw.comments = raw.comments ?? library.comments;
  raw.flashcards = raw.flashcards ?? library.flashcards;
  raw.research_runs = raw.research_runs ?? library.research_runs;
  raw.book_requests = raw.book_requests ?? library.book_requests;
  raw.sync_runs = raw.sync_runs ?? library.sync_runs;
  raw.claims = raw.claims ?? brain.claims;
  raw.supports = raw.supports ?? brain.supports;
  raw.backings = raw.backings ?? brain.backings;
  raw.counterclaims = raw.counterclaims ?? brain.counterclaims;
  raw.truth_items = raw.truth_items ?? brain.truth_items;
  raw.proposals = raw.proposals ?? brain.proposals;
  raw.decisions = raw.decisions ?? brain.decisions;
  raw.case_roles = raw.case_roles ?? brain.case_roles;
  raw.opposing_positions = raw.opposing_positions ?? brain.opposing_positions;
  raw.item_history = raw.item_history ?? brain.item_history;
  raw.team_principles = raw.team_principles ?? brain.team_principles;
  raw.change_the_facts = raw.change_the_facts ?? brain.change_the_facts;
  return raw;
}

export async function readStore(): Promise<SampleStore> {
  await ensureDir();
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    return migrateStore(JSON.parse(raw) as SampleStore);
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
