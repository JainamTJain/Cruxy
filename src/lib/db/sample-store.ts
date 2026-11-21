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
  AlignmentQuestionSet,
  Assignment,
  ChatChannel,
  ChatMessage,
  ClaimChangeProposal,
  ClaimMapConfirmation,
  ClaimMapVersion,
  DriftFlag,
  PersonPrefs,
  RoadmapStage,
} from "@/lib/team/types";
import { programChannel, teamChannel } from "@/lib/team/channels";
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
  /** Track 2 Case brain */
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
  /** Track 4 Team space */
  assignments: Assignment[];
  chats: ChatChannel[];
  messages: ChatMessage[];
  claim_map_versions: ClaimMapVersion[];
  claim_map_confirmations: ClaimMapConfirmation[];
  claim_change_proposals: ClaimChangeProposal[];
  alignment_questions: AlignmentQuestionSet[];
  drift_flags: DriftFlag[];
  roadmap_stages: RoadmapStage[];
  person_prefs: PersonPrefs[];
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
  | "roadmap_stages"
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
    roadmap_stages: [],
    person_prefs: [],
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

  const chats: ChatChannel[] = [
    {
      id: randomUUID(),
      channel: teamChannel(t1.id),
      team_id: t1.id,
      created_at: nowIso(),
    },
    {
      id: randomUUID(),
      channel: teamChannel(t2.id),
      team_id: t2.id,
      created_at: nowIso(),
    },
    {
      id: randomUUID(),
      channel: teamChannel(t3.id),
      team_id: t3.id,
      created_at: nowIso(),
    },
    {
      id: randomUUID(),
      channel: programChannel(),
      team_id: null,
      created_at: nowIso(),
    },
  ];

  const case7 = cases.find((c) => c.number === 7)!;
  const serena = people.find((p) => p.name === "Serena")!;
  const ivan = people.find((p) => p.name === "Ivan")!;
  const ashton = people.find((p) => p.name === "Ashton")!;
  const stolei = people.find((p) => p.name === "Stolei")!;
  const at = nowIso();

  const case_roles: CaseRole[] = [
    {
      id: randomUUID(),
      team_id: t1.id,
      case_id: case7.id,
      person_id: serena.id,
      role: "lead_1",
      created_at: at,
      created_by: serena.id,
    },
    {
      id: randomUUID(),
      team_id: t1.id,
      case_id: case7.id,
      person_id: ivan.id,
      role: "lead_2",
      created_at: at,
      created_by: serena.id,
    },
    {
      id: randomUUID(),
      team_id: t1.id,
      case_id: case7.id,
      person_id: ashton.id,
      role: "counter_arguer",
      created_at: at,
      created_by: serena.id,
    },
    {
      id: randomUUID(),
      team_id: t1.id,
      case_id: case7.id,
      person_id: stolei.id,
      role: "supporter",
      created_at: at,
      created_by: serena.id,
    },
  ];

  const v1: ClaimMapVersion = {
    id: randomUUID(),
    team_id: t1.id,
    case_id: case7.id,
    version: 1,
    body: {
      claims: [
        {
          key: "c1",
          text: "Equal access activism must protect speech without enabling harassment.",
          logic_line: "Rights collide; institutions owe a workable boundary.",
          supports: [
            {
              key: "c1s1",
              text: "Campus codes already balance safety and expression.",
            },
            {
              key: "c1s2",
              text: "Harassment chills participation more than content rules.",
            },
          ],
          counterclaim_response:
            "We do not concede viewpoint discrimination; we target conduct.",
        },
        {
          key: "c2",
          text: "Transparent criteria beat ad-hoc platform bans.",
          logic_line: "Predictability is fairness for speakers and targets.",
          supports: [
            {
              key: "c2s1",
              text: "Published standards let students plan advocacy.",
            },
          ],
        },
      ],
    },
    change_summary: "Initial Team 1 position for Case 7.",
    created_by: serena.id,
    created_at: at,
  };

  const truth_items: TruthItem[] = [
    {
      id: randomUUID(),
      team_id: t1.id,
      case_id: case7.id,
      kind: "framework",
      text: "Team 1 Truth: distinguish protected advocacy from targeted harassment by published conduct criteria.",
      citation_ids: ["seed-truth-c7-1"],
      status: "accepted",
      created_at: at,
      created_by: serena.id,
      updated_at: at,
    },
    {
      id: randomUUID(),
      team_id: t1.id,
      case_id: case7.id,
      kind: "quote",
      text: "Equal Access Activism case set: platforms that silence speakers without criteria invite distrust.",
      citation_ids: ["seed-truth-c7-2"],
      status: "accepted",
      created_at: at,
      created_by: serena.id,
      updated_at: at,
    },
  ];

  const roadmap_stages: RoadmapStage[] = case_roles.map((r) => ({
    id: randomUUID(),
    person_id: r.person_id,
    case_id: r.case_id,
    stage: `role:${r.role}`,
    required: true,
    due: "2026-11-28",
    done_at: at,
    created_at: at,
  }));

  return {
    teams: [t1, t2, t3],
    people,
    auth_codes,
    activity_log: [],
    ai_calls: [],
    competitions: [competition],
    cases,
    ...emptyCaseBrainFields(),
    case_roles,
    truth_items,
    assignments: [],
    chats,
    messages: [],
    claim_map_versions: [v1],
    claim_map_confirmations: [
      {
        id: randomUUID(),
        version_id: v1.id,
        person_id: serena.id,
        confirmed_at: at,
      },
    ],
    claim_change_proposals: [],
    alignment_questions: [],
    drift_flags: [],
    roadmap_stages,
    person_prefs: [],
    seeded_at: at,
    last_tech_reauth_at: null,
  };
}

function migrateStoreShape(raw: SampleStore): SampleStore {
  const brain = emptyCaseBrainFields();
  const team = emptyTeamSpaceFields();
  return {
    ...raw,
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
    roadmap_stages: raw.roadmap_stages ?? team.roadmap_stages,
    person_prefs: raw.person_prefs ?? team.person_prefs,
  };
}

let writeChain: Promise<void> = Promise.resolve();

export async function readStore(): Promise<SampleStore> {
  await ensureDir();
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    return migrateStoreShape(JSON.parse(raw) as SampleStore);
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
