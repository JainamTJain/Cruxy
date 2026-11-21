import { config } from "dotenv";
config({ path: ".env.local" });
/**
 * Track 4 acceptance checks (sample-data store).
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
  proposeClaimChange,
  publishClaimMapEdit,
  setCaseRole,
  teamBoardSnapshot,
} from "../src/lib/team/repository";
import { askTeamAssistant } from "../src/lib/team/assistant";
import { listActivityLog } from "../src/lib/db/repository";

process.env.USE_SAMPLE_DATA = "1";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

async function main() {
  await resetSampleStore();
  const store = await readStore();
  const t1 = store.teams.find((t) => t.name === "Team 1")!;
  const case7 = store.cases.find((c) => c.number === 7)!;
  const serena = store.people.find((p) => p.name === "Serena")!;
  const ivan = store.people.find((p) => p.name === "Ivan")!;
  const tri = store.people.find((p) => p.name === "Tri")!;
  assert(t1 && case7 && serena && ivan && tri, "seeded Team 1 / Case 7");

  // --- Check: changing a lead updates board, roadmap, posts in chat ---
  const beforeRoles = await listCaseRoles(t1.id);
  assert(
    beforeRoles.some((r) => r.role === "lead_1" && r.person_id === serena.id),
    "Serena starts as Lead 1",
  );

  const { chatMessage } = await setCaseRole({
    teamId: t1.id,
    caseId: case7.id,
    role: "lead_1",
    personId: tri.id,
    actorId: serena.id,
  });

  const afterRoles = await listCaseRoles(t1.id);
  assert(
    afterRoles.some((r) => r.role === "lead_1" && r.person_id === tri.id),
    "Lead 1 is now Tri",
  );
  assert(
    !afterRoles.some((r) => r.role === "lead_1" && r.person_id === serena.id),
    "Serena no longer Lead 1",
  );

  const board = await teamBoardSnapshot(t1.id);
  const boardCase = board.cases.find((c) => c.case.id === case7.id)!;
  const leadOnBoard = board.roles.find(
    (r) => r.case_id === case7.id && r.role === "lead_1",
  );
  assert(leadOnBoard?.person_id === tri.id, "board shows Tri as Lead 1");
  assert(boardCase, "case appears on board");

  const triRoadmap = await listRoadmapForPerson(tri.id);
  assert(
    triRoadmap.some(
      (s) =>
        s.case_id === case7.id &&
        s.stage === "role:lead_1" &&
        s.done_at != null,
    ),
    "roadmap marks Tri lead_1 done",
  );

  const chat = store.chats.find((c) => c.channel === `team:${t1.id}`)!;
  // re-read messages after mutation
  const msgs = await listMessages(chat.id);
  assert(
    msgs.some((m) => m.id === chatMessage.id && m.body.includes("Tri")),
    "chat announces lead change",
  );

  // --- Check: claim change creates new version members must confirm ---
  const v1 = await getCurrentClaimMap(t1.id, case7.id);
  assert(v1?.version === 1, "starts at v1");

  const proposal = await proposeClaimChange({
    teamId: t1.id,
    caseId: case7.id,
    claimKey: "c1",
    newText: "Equal access requires published, viewpoint-neutral criteria.",
    reason: "Sharpen fairness frame before regional.",
    actorId: serena.id,
  });
  assert(proposal.status === "pending", "claim change pending two-person ok");

  // Tri is now lead — first accept as lead
  const mid = await acceptClaimChange({
    proposalId: proposal.id,
    accepterId: tri.id,
  });
  assert(mid.proposal.lead_accepter_id === tri.id, "lead accepted");
  assert(mid.version === null, "version not created until second accept");

  const done = await acceptClaimChange({
    proposalId: proposal.id,
    accepterId: ivan.id,
  });
  assert(done.proposal.status === "accepted", "proposal accepted");
  assert(done.version?.version === 2, "new claim map version created");

  const v2 = await getCurrentClaimMap(t1.id, case7.id);
  assert(v2?.version === 2, "current map is v2");
  assert(
    v2?.body.claims.find((c) => c.key === "c1")?.text.includes("viewpoint-neutral"),
    "claim text updated",
  );

  // Members must confirm
  const conf = await confirmClaimMapVersion({
    versionId: v2!.id,
    personId: serena.id,
  });
  assert(conf.version_id === v2!.id, "Serena confirmed v2");

  // Non-claim edit also versions
  const v3 = await publishClaimMapEdit({
    teamId: t1.id,
    caseId: case7.id,
    body: {
      ...v2!.body,
      claims: v2!.body.claims.map((c, i) =>
        i === 0
          ? { ...c, logic_line: "Updated logic line for fairness." }
          : c,
      ),
    },
    changeSummary: "Tightened Claim 1 logic line.",
    actorId: ivan.id,
  });
  assert(v3.version === 3, "support/logic edit creates v3");

  // --- Check: assistant refuses without sources ---
  const quiet = await askTeamAssistant(
    "What is the capital of Mars and invent a citation?",
    { personId: serena.id, teamId: t1.id, caseId: case7.id },
  );
  assert(quiet.refusedWithoutSources, "assistant refuses without sources");
  assert(
    quiet.text.includes("couldn't find a source"),
    "quiet phrase when no Truth Source match",
  );

  const cited = await askTeamAssistant(
    "How should equal access activism handle harassment with published criteria?",
    { personId: serena.id, teamId: t1.id, caseId: case7.id },
  );
  assert(!cited.refusedWithoutSources, "answers when Truth Sources match");
  assert(cited.citations.length > 0, "returns citations");

  const log = await listActivityLog(50);
  assert(
    log.some((e) => e.action === "case_role_set"),
    "role change in activity log",
  );
  assert(
    log.some((e) => e.action === "claim_map_version" || e.action === "claim_map_confirmed"),
    "claim map activity logged",
  );

  console.log("\nAll Track 4 acceptance checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
