import { config } from "dotenv";
config({ path: ".env.local" });
/**
 * Track 4 / Workstream E acceptance checks (sample-data store).
 * Run: npx tsx scripts/track4-checks.ts
 * Never prints secret env values.
 */
import { resetSampleStore, readStore } from "../src/lib/db/sample-store";
import {
  acceptClaimChange,
  confirmClaimMapVersion,
  getCurrentClaimMap,
  listCaseRoles,
  listMessages,
  listRoadmapForPerson,
  markMessageIdea,
  proposeClaimChange,
  publishClaimMapEdit,
  setCaseRole,
  teamBoardSnapshot,
} from "../src/lib/team/repository";
import { askTeamAssistant } from "../src/lib/team/assistant";
import { listActivityLog } from "../src/lib/db/repository";
import { SEED_TEAM_IDS } from "../src/lib/seed/ids";

process.env.USE_SAMPLE_DATA = "1";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

async function main() {
  await resetSampleStore();
  const store = await readStore();
  const t3 = store.teams.find((t) => t.id === SEED_TEAM_IDS.team3)!;
  const case9 = store.cases.find((c) => c.number === 9)!;
  const case10 = store.cases.find((c) => c.number === 10)!;
  const case13 = store.cases.find((c) => c.number === 13)!;
  const nick = store.people.find((p) => p.name === "Nick")!;
  const daniel = store.people.find((p) => p.name === "Daniel")!;
  const katie = store.people.find((p) => p.name === "Katie")!;
  const jainam = store.people.find((p) => p.name === "Jainam")!;
  assert(t3 && case9 && nick && daniel && katie && jainam, "seeded Team 3");

  // Board shows 12 cases, Case 10 gap (no Lead 1), Case 9 Jainam Lead 1
  const board = await teamBoardSnapshot(t3.id);
  assert(board.cases.length === 12, "board lists 12 active cases");
  assert(
    !board.roles.some((r) => r.case_id === case10.id && r.role === "lead_1"),
    "Case 10 has no Lead 1 (gap)",
  );
  assert(
    board.roles.some(
      (r) =>
        r.case_id === case9.id &&
        r.role === "lead_1" &&
        r.person_id === jainam.id,
    ),
    "Case 9 Lead 1 is Jainam",
  );
  const case9Map = board.cases.find((c) => c.case.id === case9.id)!;
  assert(case9Map.current?.version === 7, "Case 9 claim map is v7");
  assert(case9Map.confirmations.length === 3, "Case 9 has 3 of 4 confirmed");

  // Chat seeded with version diff + idea + role change
  const chat = store.chats.find((c) => c.channel === `team:${t3.id}`)!;
  const msgs = await listMessages(chat.id);
  assert(
    msgs.some((m) => m.link_refs && (m.link_refs as { kind?: string }).kind === "claim_diff"),
    "chat has claim version diff",
  );
  assert(
    msgs.some((m) => m.is_idea && m.case_id === case13.id),
    "chat has idea marked for Case 13",
  );

  // Two-tap role change updates board, roadmap, chat
  const { chatMessage } = await setCaseRole({
    teamId: t3.id,
    caseId: case9.id,
    role: "supporter",
    personId: nick.id,
    actorId: katie.id,
  });
  const afterRoles = await listCaseRoles(t3.id);
  assert(
    afterRoles.some(
      (r) =>
        r.case_id === case9.id &&
        r.role === "supporter" &&
        r.person_id === nick.id,
    ),
    "Nick is supporter on Case 9",
  );
  const nickRoadmap = await listRoadmapForPerson(nick.id);
  assert(
    nickRoadmap.some(
      (s) =>
        s.case_id === case9.id &&
        s.stage === "role:supporter" &&
        s.done_at != null,
    ),
    "roadmap marks Nick supporter done",
  );
  const msgs2 = await listMessages(chat.id);
  assert(
    msgs2.some((m) => m.id === chatMessage.id && /Nick/.test(m.body)),
    "chat announces role change",
  );

  // Claim change needs two people; confirmations
  const v7 = await getCurrentClaimMap(t3.id, case9.id);
  assert(v7?.version === 7, "starts at seeded v7");
  const proposal = await proposeClaimChange({
    teamId: t3.id,
    caseId: case9.id,
    claimKey: "c1",
    newText: "The Museum's title is defective; repair falls on who still benefits.",
    reason: "Tighten Claim 1 for regional.",
    actorId: katie.id,
  });
  assert(proposal.status === "pending", "claim change pending two-person ok");
  const mid = await acceptClaimChange({
    proposalId: proposal.id,
    accepterId: jainam.id,
  });
  assert(mid.proposal.lead_accepter_id === jainam.id, "lead accepted");
  assert(mid.version === null, "version not created until second accept");
  const done = await acceptClaimChange({
    proposalId: proposal.id,
    accepterId: daniel.id,
  });
  assert(done.proposal.status === "accepted", "proposal accepted");
  assert(done.version?.version === 8, "new claim map version created");
  const conf = await confirmClaimMapVersion({
    versionId: done.version!.id,
    personId: katie.id,
  });
  assert(conf.version_id === done.version!.id, "Katie confirmed new version");

  const vSupport = await publishClaimMapEdit({
    teamId: t3.id,
    caseId: case9.id,
    body: {
      ...done.version!.body,
      claims: done.version!.body.claims.map((c, i) =>
        i === 0
          ? { ...c, logic_line: "Updated logic line for repair duty." }
          : c,
      ),
    },
    changeSummary: "Tightened Claim 1 logic line.",
    actorId: daniel.id,
  });
  assert(vSupport.version === 9, "support/logic edit creates next version");

  // Mark as idea → Truth Sources queue
  const plain = await (await import("../src/lib/team/repository")).postMessage({
    chatId: chat.id,
    personId: nick.id,
    body: "The Panthers example belongs on Case 13 as a support.",
    caseId: case13.id,
    actorTeamId: t3.id,
    actorRole: "member",
  });
  const idea = await markMessageIdea(plain.id, nick.id);
  assert(idea.is_idea, "message marked as idea");
  const store2 = await readStore();
  assert(
    store2.proposals.some((p) => p.idea_key === `chat-idea:${plain.id}`),
    "idea queued as Truth Source proposal",
  );

  // Assistant: refuse without sources; cite when Truth Sources match
  const quiet = await askTeamAssistant(
    "What is the capital of Mars and invent a citation?",
    { personId: katie.id, teamId: t3.id, caseId: case9.id },
  );
  assert(quiet.refusedWithoutSources, "assistant refuses without sources");
  assert(
    quiet.text.includes("couldn't find a source"),
    "quiet phrase when no Truth Source match",
  );

  const cited = await askTeamAssistant(
    "Why does return of the Stone need a reciprocal partnership now?",
    { personId: katie.id, teamId: t3.id, caseId: case9.id },
  );
  assert(!cited.refusedWithoutSources, "answers when Truth Sources match");
  assert(cited.citations.length > 0, "returns citations");
  assert(cited.questionFirst, "asks before it answers");

  const log = await listActivityLog(80);
  assert(
    log.some((e) => e.action === "case_role_set"),
    "role change in activity log",
  );
  assert(
    log.some(
      (e) =>
        e.action === "claim_map_version" || e.action === "claim_map_confirmed",
    ),
    "claim map activity logged",
  );

  console.log("\nAll Track 4 / Workstream E acceptance checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
