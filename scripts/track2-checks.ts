import { config } from "dotenv";
config({ path: ".env.local" });
/**
 * Track 2 Case brain acceptance checks (sample-data path).
 * Run: npx tsx scripts/track2-checks.ts
 * Never prints secret env values.
 */
import { resetSampleStore, readStore } from "../src/lib/db/sample-store";
import {
  createProposal,
  decideProposal,
  ensureClaimMapShell,
  getCaseBrain,
  getHistoryForTarget,
  markSocraticAnswered,
  updateClaim,
} from "../src/lib/case-brain/service";

process.env.USE_SAMPLE_DATA = "1";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

async function main() {
  await resetSampleStore();
  const store = await readStore();
  const team1 = store.teams.find((t) => t.name === "Team 1")!;
  const team2 = store.teams.find((t) => t.name === "Team 2")!;
  const team3 = store.teams.find((t) => t.name === "Team 3")!;
  const serena = store.people.find((p) => p.name === "Serena")!;
  const lehar = store.people.find((p) => p.name === "Lehar")!;
  const case12 = store.cases.find((c) => c.number === 12)!;
  assert(team1 && team2 && team3 && serena && case12, "seeded teams and Case 12");

  await ensureClaimMapShell({
    teamId: team1.id,
    caseId: case12.id,
    personId: serena.id,
  });
  const brain = await getCaseBrain(team1.id, case12.id);
  assert(brain.claims.length >= 2, "claim map has at least 2 claims");
  assert(
    brain.claims.every((n) => n.supports.length >= 3),
    "each claim has 3 supports",
  );
  assert(
    brain.claims.every((n) => n.counterclaims.length >= 1),
    "each claim has a counterclaim",
  );

  // Decision without reason cannot be saved
  const proposal = await createProposal({
    teamId: team1.id,
    caseId: case12.id,
    personId: serena.id,
    text: "Misinformation can cause preventable medical harm even when speech is legal.",
    kind: "fact",
    origin: "member",
    citationIds: ["passage-stub"],
  });
  const noReason = await decideProposal({
    proposalId: proposal.id,
    personId: serena.id,
    teamId: team1.id,
    verdict: "accept",
    reason: "   ",
  });
  assert(!noReason.ok, "decision without a reason cannot be saved");

  const accepted = await decideProposal({
    proposalId: proposal.id,
    personId: serena.id,
    teamId: team1.id,
    verdict: "accept",
    reason: "Fits our Claim 1 support on harm.",
  });
  assert(accepted.ok, "accept with reason saves");

  // Team 1 edit / accept appears in Teams 2 and 3 Inspired-by queues
  const t2 = await getCaseBrain(team2.id, case12.id);
  const t3 = await getCaseBrain(team3.id, case12.id);
  const inspired2 = t2.proposals.filter(
    (p) =>
      p.origin === "inspired_by_team" &&
      p.inspired_from_team_id === team1.id &&
      p.status === "pending",
  );
  const inspired3 = t3.proposals.filter(
    (p) =>
      p.origin === "inspired_by_team" &&
      p.inspired_from_team_id === team1.id &&
      p.status === "pending",
  );
  assert(inspired2.length >= 1, "Team 1 accept appears in Team 2 queue");
  assert(inspired3.length >= 1, "Team 1 accept appears in Team 3 queue");

  // Claim edit also fans out
  const claimId = brain.claims[0]!.claim.id;
  const edit = await updateClaim({
    claimId,
    personId: serena.id,
    teamId: team1.id,
    text: "Institutions may limit medical misinformation when it foreseeably causes serious harm.",
    reason: "Sharpened the claim after practice.",
  });
  assert(edit.ok, "claim edit with reason saves");

  const t2b = await getCaseBrain(team2.id, case12.id);
  assert(
    t2b.proposals.some(
      (p) =>
        p.origin === "inspired_by_team" &&
        p.kind === "claim_edit" &&
        p.status === "pending",
    ),
    "Team 1 claim edit appears in Team 2 Inspired-by queue",
  );

  // Socratic gate before Inspired-by decision
  const inspired = (await getCaseBrain(team2.id, case12.id)).proposals.find(
    (p) => p.origin === "inspired_by_team" && p.status === "pending",
  )!;
  assert(inspired.socratic_question, "Inspired-by has a Socratic question");
  assert(!inspired.socratic_answered, "Socratic not yet answered");
  const blocked = await decideProposal({
    proposalId: inspired.id,
    personId: lehar.id,
    teamId: team2.id,
    verdict: "reject",
    reason: "Does not fit our principle.",
  });
  assert(!blocked.ok, "Inspired-by blocked until Socratic answered");
  await markSocraticAnswered({
    proposalId: inspired.id,
    teamId: team2.id,
    personId: lehar.id,
  });
  const afterSocratic = await decideProposal({
    proposalId: inspired.id,
    personId: lehar.id,
    teamId: team2.id,
    verdict: "reject",
    reason: "Does not fit our principle.",
  });
  assert(afterSocratic.ok, "Inspired-by decision works after Socratic");

  // History shows every change
  const histClaim = await getHistoryForTarget(claimId);
  assert(
    histClaim.some((h) => h.action === "claim_edited"),
    "history shows claim edit",
  );
  const histProposal = await getHistoryForTarget(proposal.id);
  assert(
    histProposal.some((h) => h.action === "proposal_created"),
    "history shows proposal create",
  );
  const histDecision = await getHistoryForTarget(accepted.ok ? accepted.decision.id : "");
  assert(
    histDecision.some((h) => h.action === "decision_accept"),
    "history shows decision",
  );

  // Analyst note only when problem
  const weak = await createProposal({
    teamId: team1.id,
    caseId: case12.id,
    personId: serena.id,
    text: "Nope",
    kind: "fact",
    origin: "member",
  });
  assert(weak.cruxy_note, "Analyst note present for weak / unverified proposal");

  const strong = await createProposal({
    teamId: team1.id,
    caseId: case12.id,
    personId: serena.id,
    text: "A verified framework can still leave residual risk when institutions act under uncertainty.",
    kind: "framework",
    origin: "research",
    citationIds: ["passage-ok"],
  });
  assert(
    strong.cruxy_note === null,
    "No Analyst note when proposal passes the check",
  );

  console.log("\nAll Track 2 acceptance checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
