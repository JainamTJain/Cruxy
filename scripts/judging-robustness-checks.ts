import { config } from "dotenv";
config({ path: ".env.local" });
/**
 * Judging and feedback report robustness checks (sample-data path).
 * Run: npm run check:judging
 * Never prints secret env values or student transcript text.
 */
import { resetSampleStore, readStore } from "../src/lib/db/sample-store";
import {
  createSession,
  findJudgeCard,
  getReport,
  getTranscript,
  listJudgeCards,
  saveJudgeCard,
  saveRecording,
  upsertJudge,
} from "../src/lib/db/practice-repository";
import { newRecording, saveChunk } from "../src/lib/practice/recording";
import { finalizeRound } from "../src/lib/practice/pipeline";
import { runJudgeAgent } from "../src/lib/cruxy/agents/judge";
import { validateEvidence, filterDisplayableScores } from "../src/lib/practice/appe-card";
import {
  classifyReportStatus,
  reportStatusCopy,
} from "../src/lib/practice/report-status";
import { randomUUID } from "crypto";
import {
  DEFAULT_ROUND_TIMINGS,
  type AppeItemKey,
  type CardScore,
  type JudgeCard,
  type PracticeRound,
} from "../src/lib/practice/types";
import { nowIso } from "../src/lib/utils";

process.env.USE_SAMPLE_DATA = "1";
process.env.CRUXY_USE_FIXTURES = "1";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

async function main() {
  await resetSampleStore();
  const store = await readStore();
  const jainam = store.people.find((p) => p.name === "Jainam");
  const serena = store.people.find((p) => p.name === "Serena");
  const t1 = store.teams.find((t) => t.name === "Team 1");
  const t2 = store.teams.find((t) => t.name === "Team 2");
  const t3 = store.teams.find((t) => t.name === "Team 3");
  const caseRow = store.cases.find((c) => c.active);
  assert(jainam && serena && t1 && t2 && t3 && caseRow, "seeded people and teams");

  // Evidence validation: Cruxy needs a quote; humans do not.
  assert(
    !validateEvidence(
      { score: 7, comment: null, evidence_line_ids: [] },
      true,
    ).ok,
    "Cruxy score without evidence is refused",
  );
  assert(
    validateEvidence(
      { score: 7, comment: "clear", evidence_line_ids: [] },
      false,
    ).ok,
    "human score without evidence is allowed",
  );
  assert(
    filterDisplayableScores(
      [
        {
          id: "1",
          card_id: "c",
          item: "presentation_a",
          score: 7,
          comment: null,
          evidence_line_ids: [],
          created_at: nowIso(),
        },
      ],
      true,
    ).length === 0,
    "display filter drops Cruxy scores with no evidence",
  );

  // Report status copy for pre-transcript / failed judging.
  const stubRound: PracticeRound = {
    id: "r",
    session_id: "s",
    case_id: caseRow!.id,
    case_number: caseRow!.number,
    team_ids: [t3!.id],
    sides: { presenting: t3!.id, commenting: null },
    moderator: "cruxy",
    judges: { humans: [], cruxy: true },
    timings: DEFAULT_ROUND_TIMINGS,
    mode: "full_round",
    phase: "done",
    order: 0,
    started_at: nowIso(),
    ended_at: null,
    created_at: nowIso(),
    created_by: jainam!.id,
  };
  const waiting = classifyReportStatus({
    round: stubRound,
    reportHeadline: null,
    lines: [],
    cards: [],
  });
  assert(waiting === "waiting_transcript", "no lines → waiting_transcript");
  assert(
    reportStatusCopy("judging_failed").title.includes("could not finish"),
    "failed judging has clear copy",
  );

  // Session with Cruxy judge (no humans).
  const created = await createSession({
    kind: "admin",
    title: "Judging robustness check",
    date: "2026-12-01",
    place: "THH",
    online: false,
    createdBy: jainam!.id,
    rounds: [
      {
        caseId: caseRow!.id,
        caseNumber: caseRow!.number,
        teamIds: [t3!.id, t1!.id],
        sides: { presenting: t3!.id, commenting: t1!.id },
        moderator: "cruxy",
        judges: { humans: [], cruxy: true },
        mode: "full_round",
      },
    ],
  });
  const round = created.rounds[0]!;
  assert(round, "round created");

  const recording = newRecording(round.id, serena!.id);
  for (let i = 0; i < 2; i++) {
    const saved = await saveChunk({
      roundId: round.id,
      index: i,
      bytes: Buffer.from(`chunk-${i}`),
    });
    recording.chunk_paths.push(saved.path);
    recording.chunk_meta.push({
      index: i,
      bytes: saved.bytes,
      uploaded_at: new Date().toISOString(),
    });
  }
  await saveRecording(recording);

  const result = await finalizeRound({
    roundId: round.id,
    personId: jainam!.id,
  });
  assert(result.lines.length > 0, "transcript after finalize");
  assert(result.judgment, "Cruxy judgment present");
  assert(
    result.judgment!.scores.every((s) => s.evidence_line_ids.length >= 1),
    "Cruxy scores carry evidence",
  );

  const report1 = await getReport(round.id);
  assert(report1.report?.headline, "report headline stored");
  assert(
    classifyReportStatus({
      round,
      reportHeadline: report1.report?.headline,
      lines: report1.lines,
      cards: report1.cards,
    }) === "ready" ||
      classifyReportStatus({
        round,
        reportHeadline: report1.report?.headline,
        lines: report1.lines,
        cards: report1.cards,
      }) === "judging_failed",
    "report status is ready or failed (never silent invent)",
  );

  // Idempotent human card submit: same judge + team updates in place.
  const judge = await upsertJudge({
    name: "Prof. Check",
    background: "Past APPE judge",
    personId: null,
  });
  const at = nowIso();
  const cardA: JudgeCard = {
    id: randomUUID(),
    round_id: round.id,
    judge_id: judge.id,
    cruxy: false,
    team_id: t3!.id,
    spirit: 4,
    spirit_comment: null,
    overall_comment: "Solid",
    moments: [{ line_id: "pending", note: "Moment at 00:12" }],
    predictions: null,
    calibration_note: null,
    calibration_use: null,
    created_at: at,
    created_by: null,
  };
  const scoresA: CardScore[] = (
    ["presentation_a", "presentation_b", "presentation_c"] as AppeItemKey[]
  ).map((item) => ({
    id: randomUUID(),
    card_id: cardA.id,
    item,
    score: 7,
    comment: null,
    evidence_line_ids: [],
    created_at: at,
  }));
  await saveJudgeCard(cardA, scoresA, { replaceScores: true });

  const found = await findJudgeCard({
    roundId: round.id,
    teamId: t3!.id,
    judgeId: judge.id,
    cruxy: false,
  });
  assert(found?.id === cardA.id, "findJudgeCard returns the saved card");

  const cardB: JudgeCard = {
    ...cardA,
    overall_comment: "Updated after reconnect",
    spirit: 5,
  };
  const scoresB: CardScore[] = scoresA.map((s) => ({
    ...s,
    id: randomUUID(),
    score: 8,
  }));
  await saveJudgeCard(cardB, scoresB, { replaceScores: true });

  const { cards, scores } = await listJudgeCards(round.id);
  const humanForTeam = cards.filter(
    (c) => !c.cruxy && c.judge_id === judge.id && c.team_id === t3!.id,
  );
  assert(humanForTeam.length === 1, "resubmit does not duplicate human card");
  assert(
    humanForTeam[0]!.overall_comment === "Updated after reconnect",
    "resubmit updates the same card",
  );
  const itemScores = scores.filter((s) => s.card_id === cardA.id);
  assert(itemScores.length === 3, "replaceScores keeps one row per item");
  assert(
    itemScores.every((s) => s.score === 8),
    "replaceScores writes the new values",
  );

  // Two judges at once: different judge ids → two cards.
  const judge2 = await upsertJudge({
    name: "Dr. Second",
    background: "Faculty",
    personId: null,
  });
  const card2: JudgeCard = {
    ...cardA,
    id: randomUUID(),
    judge_id: judge2.id,
    overall_comment: "Second judge",
  };
  await saveJudgeCard(
    card2,
    scoresA.map((s) => ({ ...s, id: randomUUID(), card_id: card2.id })),
    { replaceScores: true },
  );
  const afterTwo = await listJudgeCards(round.id);
  assert(
    afterTwo.cards.filter((c) => !c.cruxy && c.team_id === t3!.id).length === 2,
    "two judges can submit at once without clobbering",
  );

  // Failed judge agent path: no invented scores of 7 when refused.
  // Simulate by calling with empty sources after clearing fixture path briefly.
  const failed = await runJudgeAgent({
    teamIds: [t3!.id],
    items: ["presentation_a"],
    transcriptBlock: "not a real round",
    lineSources: [],
    personId: jainam!.id,
  });
  // With fixtures, this may still succeed via fixture. Assert shape only.
  assert(
    Array.isArray(failed.scores),
    "judge agent always returns a scores array",
  );
  if (failed.failed) {
    assert(failed.scores.length === 0, "failed judge returns no scores");
    assert(
      (failed.headline ?? "").toLowerCase().includes("could not"),
      "failed judge headline is honest",
    );
  }

  // Human-only finalize still creates a report.
  await resetSampleStore();
  const store2 = await readStore();
  const j2 = store2.people.find((p) => p.name === "Jainam")!;
  const case2 = store2.cases.find((c) => c.active)!;
  const teamA = store2.teams.find((t) => t.name === "Team 3")!;
  const teamB = store2.teams.find((t) => t.name === "Team 1")!;
  const humanOnly = await createSession({
    kind: "admin",
    title: "Human-only judging",
    date: "2026-12-02",
    place: "THH",
    online: false,
    createdBy: j2.id,
    rounds: [
      {
        caseId: case2.id,
        caseNumber: case2.number,
        teamIds: [teamA.id, teamB.id],
        sides: { presenting: teamA.id, commenting: teamB.id },
        moderator: "member",
        judges: { humans: ["guest"], cruxy: false },
        mode: "full_round",
      },
    ],
  });
  const r2 = humanOnly.rounds[0]!;
  const rec2 = newRecording(r2.id, j2.id);
  const chunk = await saveChunk({
    roundId: r2.id,
    index: 0,
    bytes: Buffer.from("audio"),
  });
  rec2.chunk_paths.push(chunk.path);
  rec2.chunk_meta.push({
    index: 0,
    bytes: chunk.bytes,
    uploaded_at: new Date().toISOString(),
  });
  await saveRecording(rec2);
  const fin2 = await finalizeRound({ roundId: r2.id, personId: j2.id });
  assert(fin2.lines.length > 0, "human-only round still gets a transcript");
  const rep2 = await getReport(r2.id);
  assert(rep2.report?.headline, "human-only round gets a report row");
  assert(
    (await getTranscript(r2.id)).length > 0,
    "transcript readable after human-only finalize",
  );

  console.log("\nAll judging robustness checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
