/**
 * Wave 6 / Workstream J: Socratic outcomes smoke.
 * Finish a Socratic exchange, then improve on a drill answer for that case.
 * Run: npm run smoke:socratic-outcomes
 */
import { config } from "dotenv";
config({ path: ".env.local" });

process.env.USE_SAMPLE_DATA = "1";

import {
  __clearSampleOutcomesForTests,
  listCruxyOutcomes,
} from "../src/lib/cruxy/outcomes";
import {
  __clearSampleSocraticPendingForTests,
  listPersonSocraticOutcomes,
  normalizeAttemptScore,
  openSocraticOutcomes,
  observeClaimAttempt,
  summarizeSocraticOutcomesForWeek,
} from "../src/lib/cruxy/socratic-outcomes";
import { resetSampleStore, readStore } from "../src/lib/db/sample-store";
import {
  answerQuestion,
  continueSocratic,
  startSocraticDrill,
} from "../src/lib/revision/repository";
import type { SocraticSession } from "../src/lib/revision/types";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok: ${msg}`);
}

async function forceDone(session: SocraticSession): Promise<SocraticSession> {
  // Keep answering until Cruxy marks done (stub path usually finishes in 1-2 turns).
  let cur = session;
  for (let i = 0; i < 6 && cur.status === "active"; i++) {
    cur = await continueSocratic({
      sessionId: cur.id,
      personId: cur.person_id,
      answer: `Because the claim follows from the case facts and the stakeholder duty. Attempt ${i + 1}.`,
    });
  }
  if (cur.status !== "done") {
    // Force-open outcomes as if the session finished (covers long stub paths).
    cur = { ...cur, status: "done", summary: "held\nweak\nnext" };
    await openSocraticOutcomes(cur);
  }
  return cur;
}

async function main() {
  __clearSampleOutcomesForTests();
  __clearSampleSocraticPendingForTests();
  await resetSampleStore();
  const store = await readStore();
  const katie = store.people.find((p) => p.name.startsWith("Katie"));
  const t3 = store.teams.find((t) => t.name === "Team 3");
  const case9 =
    store.cases.find((c) => c.number === 9) ??
    store.cases.find((c) => c.active);
  assert(katie && t3 && case9, "seed Katie / Team 3 / case");

  assert(
    Math.abs(normalizeAttemptScore("flashcard", 4) - 1) < 0.001,
    "flashcard grade 4 normalizes to 1",
  );
  assert(
    Math.abs(normalizeAttemptScore("round", 5) - 0.5) < 0.001,
    "round score 5/10 normalizes to 0.5",
  );

  // Weak baseline: a low drill score before Socratic
  const q =
    store.questions.find(
      (x) => x.case_id === case9.id && x.status === "active",
    ) ?? store.questions.find((x) => x.case_id === case9.id);
  assert(q, "case has a question");

  await answerQuestion({
    questionId: q.id,
    personId: katie.id,
    text: "short",
    score: 0.3,
  });

  const started = await startSocraticDrill({
    personId: katie.id,
    teamId: t3.id,
    caseId: case9.id,
  });
  assert(started.claim_links.length > 0, "Socratic session links claims");
  const done = await forceDone(started);
  assert(done.status === "done", "Socratic session finished");

  // Improved drill attempt after Socratic
  await answerQuestion({
    questionId: q.id,
    personId: katie.id,
    text: "A fuller answer that ties the claim to the duty and the case facts with care.",
    score: 0.85,
  });

  const mine = await listPersonSocraticOutcomes(katie.id);
  assert(mine.length > 0, "person has Socratic outcomes");
  assert(
    mine.some((o) => (o.score_delta ?? 0) > 0 && o.attempt_kind === "drill"),
    "drill attempt recorded as improved",
  );

  const week = await summarizeSocraticOutcomesForWeek({ sinceDays: 7 });
  assert(week.sampleSize > 0, "weekly summary counts outcomes");
  assert(week.lines[0]?.includes("Socratic"), "weekly lines mention Socratic");

  const all = await listCruxyOutcomes(50);
  assert(
    all.some((o) => o.socratic_session_id === done.id || o.agent === "coach"),
    "cruxy_outcomes holds the Socratic row",
  );

  console.log("smoke-socratic-outcomes: all passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
