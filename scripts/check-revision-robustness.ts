/**
 * Revision, roadmap and study robustness (sample mode).
 * Run: npm run check:revision
 */
import { config } from "dotenv";
config({ path: ".env.local" });
process.env.USE_SAMPLE_DATA = "1";

import { randomUUID } from "crypto";
import { resetSampleStore, readStore, updateStore } from "../src/lib/db/sample-store";
import { resolveVisibleTeamId } from "../src/lib/auth/team-privacy";
import {
  answerQuestion,
  buildWarmUp,
  confirmModeratorQuestions,
  languageSuggestions,
  reviewFlashcard,
  savePhrase,
  startSocraticDrill,
  continueSocratic,
} from "../src/lib/revision/repository";
import {
  evaluateStage,
  getEnrichedRoadmapView,
  setTeamDeadlineOverrides,
} from "../src/lib/revision/roadmap-extra";
import { SEED_TEAM_IDS } from "../src/lib/seed/ids";
import { nowIso } from "../src/lib/utils";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

async function main() {
  await resetSampleStore();
  const store = await readStore();
  const katie = store.people.find((p) => p.name === "Katie")!;
  const lehar = store.people.find((p) => p.name === "Lehar")!;
  const case9 = store.cases.find((c) => c.number === 9)!;
  assert(katie && lehar && case9, "seed people and Case 9");

  // Team privacy: member requesting another team is denied.
  const denied = resolveVisibleTeamId({
    person: katie,
    session: {
      teamId: katie.team_id!,
      adminView: false,
      role: "member",
    },
    requested: SEED_TEAM_IDS.team2,
  });
  assert(denied.denied === true, "cross-team request denied for member");
  assert(denied.teamId === katie.team_id, "member forced to own team");

  // Language suggestions only use own-team claims.
  const foreignClaimId = randomUUID();
  await updateStore((s) => {
    s.claims.push({
      id: foreignClaimId,
      team_id: SEED_TEAM_IDS.team2,
      case_id: case9.id,
      text: "Foreign claim that Katie must not see",
      logic_line: null,
      ord: 99,
      citation_ids: ["cite-x"],
      created_at: nowIso(),
      created_by: lehar.id,
      updated_at: nowIso(),
    });
  });
  const suggestions = await languageSuggestions({
    personId: katie.id,
    teamId: katie.team_id!,
    caseId: case9.id,
    claimId: foreignClaimId,
  });
  assert(
    !suggestions.plain.includes("Foreign claim"),
    "language ignores foreign claim id",
  );

  // Flashcard review logs activity and returns state.
  let cardId: string | null = null;
  await updateStore((s) => {
    const existing = s.flashcards.find(
      (c) => c.case_id === case9.id && c.team_id === katie.team_id,
    );
    if (existing) {
      cardId = existing.id;
      return;
    }
    const id = randomUUID();
    cardId = id;
    s.flashcards.push({
      id,
      team_id: katie.team_id!,
      case_id: case9.id,
      deck: "Case 9",
      front: "What is the crux?",
      back: "The core tension.",
      citation_ids: ["cite-1"],
      truth_item_id: null,
      claim_id: null,
      source_kind: "truth",
      created_at: nowIso(),
      created_by: katie.id,
      updated_at: nowIso(),
    });
  });
  assert(cardId, "have a flashcard");
  const reviewed = await reviewFlashcard({
    personId: katie.id,
    cardId: cardId!,
    grade: 3,
    mode: "typed",
  });
  assert(reviewed.state.reps >= 1, "flashcard review updates FSRS state");

  // Empty deck path: buildWarmUp with unknown case still returns structure.
  const warmEmpty = await buildWarmUp(katie.id, {
    caseId: "00000000-0000-0000-0000-000000000000",
  });
  assert(Array.isArray(warmEmpty.flashcards), "warm-up returns flashcards array");
  assert(
    Array.isArray(warmEmpty.moderator_questions),
    "warm-up returns moderator questions array",
  );

  // Case-scoped warm-up prefers that case when cards exist.
  const warm = await buildWarmUp(katie.id, { caseId: case9.id });
  assert(warm.caseId === case9.id, "warm-up remembers caseId");
  if (warm.flashcards.length) {
    assert(
      warm.flashcards.every((c) => c.case_id === case9.id),
      "warm-up cards scoped to case when available",
    );
  }

  // Socratic start + one turn + activity.
  const socratic = await startSocraticDrill({
    personId: katie.id,
    teamId: katie.team_id!,
    caseId: case9.id,
  });
  assert(socratic.status === "active", "socratic starts active");
  assert(socratic.turns.length >= 1, "socratic has opening turn");
  const after = await continueSocratic({
    sessionId: socratic.id,
    personId: katie.id,
    answer: "Because the principle still holds under the counterclaim.",
  });
  assert(after.turns.length > socratic.turns.length, "socratic accepts an answer");

  // Phrasebook save.
  const phrase = await savePhrase({
    personId: katie.id,
    caseId: case9.id,
    claimRef: null,
    text: "A plain line under 25 words.",
    kind: "plain",
  });
  assert(phrase.text.includes("plain"), "phrasebook save works");

  // Moderator confirm + answer log.
  let qId = "";
  await updateStore((s) => {
    qId = randomUUID();
    s.questions.push({
      id: qId,
      case_id: case9.id,
      text: "What would change if the facts flipped?",
      type: "change_facts",
      difficulty: 2 as const,
      origin: "member",
      origin_label: "Katie",
      status: "pending_confirm",
      asked_at_tag: null,
      created_at: nowIso(),
      created_by: katie.id,
    });
  });
  await confirmModeratorQuestions({
    questionIds: [qId],
    personId: katie.id,
  });
  const answered = await answerQuestion({
    questionId: qId,
    personId: katie.id,
    text: "Then our Claim 2 would need a new support.",
    mode: "typed",
  });
  assert(answered.score != null, "answer logs a self-relative score");

  // Roadmap: person with reading progress, deadlines, do-next.
  await updateStore((s) => {
    const files = s.files.filter((f) => f.case_ids.includes(case9.id));
    const file = files[0] ?? {
      id: randomUUID(),
      drive_id: null,
      name: "Case 9 case set [core]",
      path: null,
      mime: null,
      modified_at: null,
      checksum: null,
      case_ids: [case9.id],
      case_numbers: [9],
      type: "case_set" as const,
      confidence: 1,
      card: "core" as const,
      text_content: "x",
      scanned_pdf: false,
      status: "ready" as const,
      extracted_ideas: [],
      created_at: nowIso(),
      created_by: null,
    };
    if (!files[0]) s.files.push(file);
    s.reading_progress.push({
      id: randomUUID(),
      person_id: katie.id,
      case_id: case9.id,
      file_id: file.id,
      opened_ratio: 0.7,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  });
  const readAfter = evaluateStage(
    await readStore(),
    katie.id,
    case9.id,
    "read",
  );
  assert(readAfter.done || !readAfter.notStarted, "reading progress registers");

  await setTeamDeadlineOverrides({
    teamId: SEED_TEAM_IDS.team3,
    personId: katie.id,
    dues: { read: "2026-11-20", judged: "2026-12-03" },
  });
  const view = await getEnrichedRoadmapView({
    personId: katie.id,
    name: katie.name,
    teamId: katie.team_id,
  });
  assert(view.deadlines.read === "2026-11-20", "team deadline override applied");
  assert(Array.isArray(view.doNext), "do next list present");
  assert(typeof view.overallReady === "number", "personal readiness number");

  // Activity log covers the mutations above.
  const final = await readStore();
  const actions = new Set(
    final.activity_log
      .filter((a) => a.person_id === katie.id)
      .map((a) => a.action),
  );
  for (const needed of [
    "flashcard_review",
    "socratic_start",
    "socratic_turn",
    "phrasebook_save",
    "moderator_confirm",
    "moderator_answer",
    "roadmap_deadlines",
  ]) {
    assert(actions.has(needed), `activity_log has ${needed}`);
  }

  console.log("\nAll revision robustness checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
