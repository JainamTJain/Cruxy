import { config } from "dotenv";
config({ path: ".env.local" });
/**
 * Track 3 acceptance checks (sample-data path).
 * Run: npx tsx scripts/track3-checks.ts
 * Never prints secret env values.
 *
 * Checks from paste-ready prompt:
 * 1. A changed truth item updates its flashcards
 * 2. Dr. B's pasted text becomes separate tagged questions for her to confirm
 * 3. Roadmap stages mark themselves done from real activity
 */
import { resetSampleStore, readStore } from "../src/lib/db/sample-store";
import {
  confirmModeratorQuestions,
  ensureFlashcardsForTeamCase,
  getRoadmapView,
  listQuestions,
  pasteModeratorQuestions,
  recordMapReview,
  recordReadingProgress,
  updateTruthItemText,
  draftOnePager,
  signOffOnePager,
  latestOnePager,
} from "../src/lib/revision/repository";
import { splitPasteIntoQuestions } from "../src/lib/revision/moderator-bank";

process.env.USE_SAMPLE_DATA = "1";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

async function main() {
  await resetSampleStore();
  const store = await readStore();
  const serena = store.people.find((p) => p.name === "Serena");
  const drB = store.people.find((p) => p.name === "Dr. B");
  const team1 = store.teams.find((t) => t.name === "Team 1");
  const case12 = store.cases.find((c) => c.number === 12);
  assert(serena && drB && team1 && case12, "seeded Serena, Dr. B, Team 1, Case 12");

  // --- Check 1: truth item change updates flashcards ---
  const truth = store.truth_items.find(
    (t) => t.team_id === team1!.id && t.case_id === case12!.id,
  );
  assert(truth, "seeded truth item for Case 12");
  await ensureFlashcardsForTeamCase(team1!.id, case12!.id);
  const before = (await readStore()).flashcards.find(
    (c) => c.truth_item_id === truth!.id,
  );
  assert(before, "flashcard created from truth item");
  const newText =
    "UPDATED least-restrictive means: mildest tool that still protects the value.";
  const { flashcard } = await updateTruthItemText(
    truth!.id,
    newText,
    serena!.id,
  );
  assert(flashcard?.back === newText, "changed truth item updates flashcard back");
  assert(
    flashcard?.id === before!.id,
    "same flashcard id updated (not a duplicate orphan)",
  );

  // --- Check 2: Dr. B paste → separate tagged pending questions ---
  const paste = `
1. What is your view and main reasons?
2. How do you respond to the other team's claim that bans are required?
3. What if the misinformation concerns a time-sensitive treatment?
State your closing question in one sentence.
`;
  const split = splitPasteIntoQuestions(paste);
  assert(split.length >= 3, `paste splits into separate questions (got ${split.length})`);

  const pending = await pasteModeratorQuestions({
    raw: paste,
    caseId: case12!.id,
    personId: drB!.id,
    origin: "dr_b",
  });
  assert(pending.length >= 3, "paste creates multiple pending questions");
  assert(
    pending.every((q) => q.status === "pending_confirm"),
    "all pasted questions await confirm",
  );
  assert(
    pending.every((q) => q.origin === "dr_b" && q.origin_label === "Dr. B"),
    "origin tagged Dr. B",
  );
  assert(
    pending.every((q) => q.type && q.difficulty >= 1 && q.difficulty <= 3),
    "each question tagged with type and difficulty",
  );

  await confirmModeratorQuestions({
    questionIds: [pending[0].id],
    personId: drB!.id,
    rejectIds: [],
  });
  const active = await listQuestions({
    caseId: case12!.id,
    status: "active",
  });
  assert(
    active.some((q) => q.id === pending[0].id),
    "confirmed question becomes active",
  );

  // --- Check 3: roadmap stages auto-mark from real activity ---
  // Reading
  await recordReadingProgress({
    personId: serena!.id,
    caseId: case12!.id,
    fileId: "core-case-set",
    openedRatio: 0.75,
  });
  // Map review all claims
  await recordMapReview({
    personId: serena!.id,
    teamId: team1!.id,
    caseId: case12!.id,
    kind: "reviewed_all",
  });
  // One pager: draft, clear empty rows via save path — draft from seed should have content;
  // mark empty_rows empty and sign off
  const drafted = await draftOnePager({
    teamId: team1!.id,
    caseId: case12!.id,
    personId: serena!.id,
  });
  // Force empty_rows clear for stage (seed claim map is complete)
  const { updateStore } = await import("../src/lib/db/sample-store");
  await updateStore((s) => {
    const p = s.one_pagers.find((o) => o.id === drafted.id);
    if (p) p.body.empty_rows = [];
  });
  await signOffOnePager({
    onePagerId: drafted.id,
    personId: serena!.id,
  });
  const signed = await latestOnePager(team1!.id, case12!.id);
  assert(signed?.signed_off_by.includes(serena!.id), "one pager signed off");

  const view = await getRoadmapView(serena!.id);
  const caseRow = view.cases.find((c) => c.case.id === case12!.id);
  assert(caseRow, "roadmap includes Case 12");
  const byStage = Object.fromEntries(
    caseRow!.stages.map((s) => [s.stage, s]),
  );
  assert(byStage.read?.done_at, "read stage auto-marked from reading progress");
  assert(byStage.map?.done_at, "map stage auto-marked from map review");
  assert(
    byStage.one_pager?.done_at,
    "one_pager stage auto-marked from complete signed one pager",
  );
  assert(byStage.read?.required, "read is required for leads");
  assert(byStage.flashcards?.required, "flashcards required for lead");

  console.log("\nAll Track 3 acceptance checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
