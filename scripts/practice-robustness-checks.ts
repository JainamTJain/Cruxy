/**
 * Practice / sessions / recording robustness checks (sample mode).
 * Run: npm run check:practice-robustness
 * Never prints secret env values or transcript content.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

process.env.USE_SAMPLE_DATA = "1";
process.env.CRUXY_USE_FIXTURES = process.env.CRUXY_USE_FIXTURES || "1";

import { resetSampleStore, readStore } from "../src/lib/db/sample-store";
import {
  createSession,
  getRecordingForRound,
  getTranscript,
  joinWithSessionCode,
  saveRecording,
} from "../src/lib/db/practice-repository";
import {
  CHUNK_DURATION_MS,
  maxLossMs,
  newRecording,
  nextChunkIndex,
  saveChunk,
} from "../src/lib/practice/recording";
import {
  CLIENT_CHUNK_MS,
  chunkUploadErrorMessage,
  resolveNextIndexAfterUpload,
} from "../src/lib/practice/chunk-upload";
import {
  DRILL_ROUTES,
  hrefForPracticeScreen,
} from "../src/lib/practice/join-routing";
import { finalizeRound } from "../src/lib/practice/pipeline";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

async function main() {
  assert(CLIENT_CHUNK_MS === 10_000, "client chunk ms is 10s");
  assert(maxLossMs() === CHUNK_DURATION_MS, "max loss equals one chunk");
  assert(CHUNK_DURATION_MS <= 30_000, "loss bound is at most 30 seconds");

  // Index must not advance on failed upload.
  assert(
    resolveNextIndexAfterUpload({
      attemptedIndex: 3,
      status: 500,
      body: { error: "boom" },
      currentNext: 3,
    }) === 3,
    "failed upload keeps current next index",
  );
  assert(
    resolveNextIndexAfterUpload({
      attemptedIndex: 3,
      status: 409,
      body: { nextIndex: 2 },
      currentNext: 4,
    }) === 2,
    "409 resyncs to server nextIndex",
  );
  assert(
    resolveNextIndexAfterUpload({
      attemptedIndex: 3,
      status: 200,
      body: { nextIndex: 4 },
      currentNext: 3,
    }) === 4,
    "success advances to nextIndex",
  );

  assert(
    chunkUploadErrorMessage(403, {}).includes("cannot record") ||
      chunkUploadErrorMessage(403, { error: "text only" }) === "text only",
    "403 upload error is plain",
  );
  assert(
    chunkUploadErrorMessage(0, {}).toLowerCase().includes("network") ||
      chunkUploadErrorMessage(502, {}).toLowerCase().includes("retry"),
    "network upload error tells the person to retry",
  );

  // Join routing lands on round or judging, not only session hub.
  assert(
    hrefForPracticeScreen("presenter", {
      sessionId: "s1",
      roundId: "r1",
    }) === "/practice/rounds/r1",
    "presenter join goes to round",
  );
  assert(
    hrefForPracticeScreen("judge", {
      sessionId: "s1",
      roundId: "r1",
    }) === "/judging?round=r1",
    "judge join goes to judging portal",
  );
  assert(
    DRILL_ROUTES.solo_speech === "/practice/drills/solo-speech",
    "solo speech has a drill route",
  );
  assert(
    DRILL_ROUTES.free_record === "/practice/drills/free-record",
    "free record drill route exists",
  );

  await resetSampleStore();
  const store = await readStore();
  const jainam = store.people.find((p) => p.name === "Jainam");
  const serena = store.people.find((p) => p.name === "Serena");
  const t1 = store.teams.find((t) => t.name === "Team 1");
  const t3 = store.teams.find((t) => t.name === "Team 3");
  const caseRow = store.cases.find((c) => c.active);
  assert(jainam && serena && t1 && t3 && caseRow, "seed people/teams/case");

  const created = await createSession({
    kind: "admin",
    title: "Practice robustness check",
    date: "2026-12-05",
    place: "THH",
    online: true,
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
      {
        caseId: caseRow!.id,
        caseNumber: caseRow!.number,
        teamIds: [t1!.id, t3!.id],
        sides: { presenting: t1!.id, commenting: t3!.id },
        moderator: "cruxy",
        judges: { humans: [], cruxy: true },
        mode: "full_round",
      },
    ],
  });
  assert(created.plainCode, "admin session issues a code");
  assert(created.rounds.length === 2, "two rounds for Next round path");

  const joined = await joinWithSessionCode({
    code: created.plainCode!,
    personId: serena!.id,
  });
  assert(joined.ok, "member joins with session code");

  const round = created.rounds[0]!;
  const recording = newRecording(round.id, serena!.id, {
    ownerPersonId: serena!.id,
  });

  // Simulate ordered chunk upload + resume index.
  for (let i = 0; i < 3; i++) {
    const saved = await saveChunk({
      roundId: round.id,
      index: i,
      bytes: Buffer.from(`robust-chunk-${i}`),
      contentType: "audio/webm",
      ext: "webm",
    });
    recording.chunk_paths.push(saved.path);
    recording.chunk_meta.push({
      index: i,
      bytes: saved.bytes,
      uploaded_at: new Date().toISOString(),
    });
  }
  await saveRecording(recording);
  assert(
    nextChunkIndex(recording) === 3,
    "next chunk index resumes after 3 uploads",
  );

  const result = await finalizeRound({
    roundId: round.id,
    personId: jainam!.id,
    forceCruxy: true,
  });
  assert(result.lines.length > 0, "finalize produces transcript lines");
  assert(result.recording.deleted_at, "audio deleted after transcript");
  assert(
    (await getRecordingForRound(round.id))?.deleted_at,
    "recording row marked deleted",
  );

  // Idempotent-ish: transcript still present after finalize.
  const lines = await getTranscript(round.id);
  assert(lines.length > 0, "transcript readable after finalize");

  // Member practice must not rely on exposing codes in API responses.
  // (UI + sessions POST only return code for admins; assert join path shape.)
  const memberPractice = await createSession({
    kind: "member_practice",
    title: "Member practice robustness",
    date: "2026-12-05",
    place: null,
    online: true,
    createdBy: serena!.id,
    mode: "solo_speech",
    rounds: [
      {
        caseId: caseRow!.id,
        caseNumber: caseRow!.number,
        teamIds: [t1!.id],
        sides: { presenting: t1!.id, commenting: null },
        moderator: "cruxy",
        judges: { humans: [], cruxy: true },
        mode: "solo_speech",
      },
    ],
  });
  assert(memberPractice.session.id, "member practice session created");
  assert(
    memberPractice.rounds[0]?.mode === "solo_speech",
    "solo speech round mode set",
  );

  console.log("\nAll practice robustness checks passed.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
