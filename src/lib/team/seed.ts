/**
 * Team space seed (Workstream E): claim maps, chats, confirmations, gaps.
 * Sample-data mode only (USE_SAMPLE_DATA=1). Never applied to live Supabase:
 * invented chat, confirmations and role tweaks must not be attributed to real people.
 */
import {
  caseId,
  SEED_PERSON_IDS,
  SEED_TEAM_IDS,
  seedUuid,
} from "@/lib/seed/ids";
import type { OnePager } from "@/lib/revision/types";
import type { CaseRole } from "@/lib/case-brain/types";
import type {
  AlignmentQuestionSet,
  ChatChannel,
  ChatMessage,
  ClaimMapBody,
  ClaimMapConfirmation,
  ClaimMapVersion,
} from "@/lib/team/types";
import { programChannel, teamChannel } from "@/lib/team/channels";

const TEAM3 = SEED_TEAM_IDS.team3;
const NICK = SEED_PERSON_IDS.Nick;
const DANIEL = SEED_PERSON_IDS.Daniel;
const KATIE = SEED_PERSON_IDS.Katie;
const JAINAM = SEED_PERSON_IDS.Jainam;
const TEAM3_PEOPLE = [NICK, DANIEL, KATIE, JAINAM] as const;

/** Current version number shown on the board (matches TeamBoard.html). */
const BOARD_VERSIONS: Record<number, number> = {
  1: 4,
  3: 3,
  4: 2,
  5: 5,
  7: 6,
  9: 7,
  10: 1,
  11: 3,
  12: 8,
  13: 6,
  14: 2,
  15: 3,
};

/** How many of 4 teammates have confirmed the current map. */
const CONFIRM_COUNTS: Record<number, number> = {
  1: 4,
  3: 4,
  4: 3,
  5: 4,
  7: 4,
  9: 3,
  10: 2,
  11: 4,
  12: 4,
  13: 2,
  14: 4,
  15: 4,
};

const CASE9_OLD_C2 = "return it now";
const CASE9_NEW_C2 =
  "return it with a partnership, now";

function onePagerToClaimBody(page: OnePager): ClaimMapBody {
  return {
    claims: page.body.claims.map((c, i) => ({
      key: `c${i + 1}`,
      text: c.text,
      logic_line: c.logic_line,
      supports: c.supports
        .filter(Boolean)
        .map((text, si) => ({ key: `s${si + 1}`, text })),
      counterclaim_response: page.body.counterclaim
        ? `${page.body.counterclaim.concede} / ${page.body.counterclaim.distinguish} / ${page.body.counterclaim.rebut}`
        : undefined,
    })),
  };
}

function case9V6Body(page: OnePager): ClaimMapBody {
  const body = onePagerToClaimBody(page);
  if (body.claims[1]) {
    body.claims[1] = {
      ...body.claims[1],
      text: CASE9_OLD_C2,
    };
  }
  return body;
}

function case9V7Body(page: OnePager): ClaimMapBody {
  const body = onePagerToClaimBody(page);
  if (body.claims[1]) {
    body.claims[1] = {
      ...body.claims[1],
      // Design copy (short form of the prep-doc Claim 2).
      text: CASE9_NEW_C2,
    };
  }
  return body;
}

export type TeamSpaceSeed = {
  case_roles: CaseRole[];
  chats: ChatChannel[];
  messages: ChatMessage[];
  claim_map_versions: ClaimMapVersion[];
  claim_map_confirmations: ClaimMapConfirmation[];
  alignment_questions: AlignmentQuestionSet[];
};

/**
 * Build team-space rows from Team 3 one pagers.
 * - Leaves Case 10 with no Lead 1 (gap).
 * - Sets Case 9 Lead 1 to Jainam (after Katie's role change in chat).
 * - Seeds Case 9 v6→v7 diff in chat with confirmations and alignment Qs.
 */
export function buildTeamSpaceSeed(input: {
  onePagers: OnePager[];
  caseRoles: CaseRole[];
}): TeamSpaceSeed {
  const t3Pages = input.onePagers.filter((p) => p.team_id === TEAM3);
  const byCase = new Map(t3Pages.map((p) => [p.case_id, p]));

  // Roles: start from content seed, then apply board adjustments.
  let case_roles = input.caseRoles.filter((r) => r.team_id === TEAM3);
  // Gap: Case 10 has no Lead 1.
  case_roles = case_roles.filter(
    (r) => !(r.case_id === caseId(10) && r.role === "lead_1"),
  );
  // Case 9: Jainam is Lead 1 (chat announces Katie's change).
  // Previous Lead 1 (Daniel) moves to counter-arguer so every slot stays filled.
  case_roles = case_roles.filter(
    (r) =>
      !(
        r.case_id === caseId(9) &&
        (r.role === "lead_1" ||
          r.role === "counter_arguer" ||
          r.person_id === JAINAM)
      ),
  );
  case_roles.push(
    {
      id: seedUuid("role:t3:9:lead_1:jainam"),
      team_id: TEAM3,
      case_id: caseId(9),
      person_id: JAINAM,
      role: "lead_1",
      created_at: "2026-11-18T18:00:00.000Z",
      created_by: KATIE,
    },
    {
      id: seedUuid("role:t3:9:counter:daniel"),
      team_id: TEAM3,
      case_id: caseId(9),
      person_id: DANIEL,
      role: "counter_arguer",
      created_at: "2026-11-18T18:00:00.000Z",
      created_by: KATIE,
    },
  );
  // Keep other teams' roles untouched (none seeded today).
  const otherRoles = input.caseRoles.filter((r) => r.team_id !== TEAM3);
  case_roles = [...otherRoles, ...case_roles];

  const claim_map_versions: ClaimMapVersion[] = [];
  const claim_map_confirmations: ClaimMapConfirmation[] = [];
  const alignment_questions: AlignmentQuestionSet[] = [];

  for (const [num, version] of Object.entries(BOARD_VERSIONS)) {
    const n = Number(num);
    const cid = caseId(n);
    const page = byCase.get(cid);
    if (!page) continue;

    if (n === 9) {
      const v6Id = seedUuid("cmap:t3:9:v6");
      const v7Id = seedUuid("cmap:t3:9:v7");
      claim_map_versions.push({
        id: v6Id,
        team_id: TEAM3,
        case_id: cid,
        version: 6,
        body: case9V6Body(page),
        change_summary: "Tightened Claim 2 wording before partnership edit.",
        created_by: DANIEL,
        created_at: "2026-11-17T16:00:00.000Z",
      });
      claim_map_versions.push({
        id: v7Id,
        team_id: TEAM3,
        case_id: cid,
        version: 7,
        body: case9V7Body(page),
        change_summary:
          "Claim 2 changed: return it now → return it with a partnership, now. Reason (Katie): Team 1's Louvre point.",
        created_by: KATIE,
        created_at: "2026-11-18T17:30:00.000Z",
      });
      // 3 of 4 confirmed (Nick, Daniel, Katie; Jainam still catching up).
      for (const [i, personId] of [NICK, DANIEL, KATIE].entries()) {
        claim_map_confirmations.push({
          id: seedUuid(`cmap-conf:t3:9:v7:${i}`),
          version_id: v7Id,
          person_id: personId,
          confirmed_at: `2026-11-18T18:${10 + i}:00.000Z`,
        });
      }
      // Alignment questions for Jainam (not yet confirmed).
      alignment_questions.push({
        id: seedUuid("align:t3:9:v7:jainam"),
        version_id: v7Id,
        person_id: JAINAM,
        questions: [
          "What is our Claim 2 now?",
          "How do we answer the Louvre / caretaker point?",
          "How do we answer the main counterclaim?",
        ],
        answers: null,
        drifted: false,
        created_at: "2026-11-18T17:31:00.000Z",
        answered_at: null,
      });
      continue;
    }

    const versionId = seedUuid(`cmap:t3:${n}:v${version}`);
    claim_map_versions.push({
      id: versionId,
      team_id: TEAM3,
      case_id: cid,
      version,
      body: onePagerToClaimBody(page),
      change_summary:
        version === 1
          ? "Imported from Team 3 case prep doc"
          : `Claim map at v${version} from Team 3 prep.`,
      created_by: TEAM3_PEOPLE[n % TEAM3_PEOPLE.length]!,
      created_at: "2026-11-15T12:00:00.000Z",
    });
    const count = CONFIRM_COUNTS[n] ?? 0;
    for (let i = 0; i < count; i++) {
      claim_map_confirmations.push({
        id: seedUuid(`cmap-conf:t3:${n}:v${version}:${i}`),
        version_id: versionId,
        person_id: TEAM3_PEOPLE[i]!,
        confirmed_at: `2026-11-16T12:${String(i).padStart(2, "0")}:00.000Z`,
      });
    }
  }

  const chatId = seedUuid("chat:team3");
  const programChatId = seedUuid("chat:program");
  const chats: ChatChannel[] = [
    {
      id: programChatId,
      channel: programChannel(),
      team_id: null,
      created_at: "2026-11-01T00:00:00.000Z",
    },
    {
      id: chatId,
      channel: teamChannel(TEAM3),
      team_id: TEAM3,
      created_at: "2026-11-01T00:00:00.000Z",
    },
    {
      id: seedUuid("chat:team1"),
      channel: teamChannel(SEED_TEAM_IDS.team1),
      team_id: SEED_TEAM_IDS.team1,
      created_at: "2026-11-01T00:00:00.000Z",
    },
    {
      id: seedUuid("chat:team2"),
      channel: teamChannel(SEED_TEAM_IDS.team2),
      team_id: SEED_TEAM_IDS.team2,
      created_at: "2026-11-01T00:00:00.000Z",
    },
  ];

  const v7Id = seedUuid("cmap:t3:9:v7");
  const messages: ChatMessage[] = [
    {
      id: seedUuid("msg:t3:v7"),
      chat_id: chatId,
      person_id: null,
      from_cruxy: true,
      body: `CRUXY: Case 9 is now v7\nClaim 2 changed: "${CASE9_OLD_C2}" → "${CASE9_NEW_C2}". Reason (Katie): Team 1's Louvre point.`,
      is_idea: false,
      mention_ids: [],
      case_id: caseId(9),
      link_refs: {
        kind: "claim_diff",
        old_text: CASE9_OLD_C2,
        new_text: CASE9_NEW_C2,
        version_id: v7Id,
        version: 7,
        confirmed_count: 3,
        team_size: 4,
      },
      created_at: "2026-11-18T17:30:30.000Z",
    },
    {
      id: seedUuid("msg:t3:nick"),
      chat_id: chatId,
      person_id: NICK,
      from_cruxy: false,
      body: "Can someone own the Case 13 counterclaim row by Monday?",
      is_idea: false,
      mention_ids: [],
      case_id: caseId(13),
      link_refs: null,
      created_at: "2026-11-18T19:00:00.000Z",
    },
    {
      id: seedUuid("msg:t3:daniel"),
      chat_id: chatId,
      person_id: DANIEL,
      from_cruxy: false,
      body: "On it. Also: the Panthers example shows why the law must stay narrow.",
      is_idea: true,
      mention_ids: [],
      case_id: caseId(13),
      link_refs: { kind: "idea", case_number: 13 },
      created_at: "2026-11-18T19:12:00.000Z",
    },
    {
      id: seedUuid("msg:t3:role"),
      chat_id: chatId,
      person_id: null,
      from_cruxy: true,
      body: "Katie made Jainam Lead 1 on Case 9.",
      is_idea: false,
      mention_ids: [JAINAM, KATIE],
      case_id: caseId(9),
      link_refs: { kind: "role_change", role: "lead_1" },
      created_at: "2026-11-18T19:20:00.000Z",
    },
  ];

  return {
    case_roles,
    chats,
    messages,
    claim_map_versions,
    claim_map_confirmations,
    alignment_questions,
  };
}
