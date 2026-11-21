import { config } from "dotenv";
config({ path: ".env.local" });
/**
 * Track 5 Practice acceptance checks (sample-data path).
 * Run: npm run check:track5
 * Never prints secret env values.
 */
import { resetSampleStore, readStore } from "../src/lib/db/sample-store";
import {
  createSession,
  getRecordingForRound,
  getReport,
  getTranscript,
  joinWithSessionCode,
  saveRecording,
} from "../src/lib/db/practice-repository";
import {
  CHUNK_DURATION_MS,
  maxLossMs,
  newRecording,
  saveChunk,
  audioStillExists,
} from "../src/lib/practice/recording";
import { finalizeRound } from "../src/lib/practice/pipeline";
import { feedbackHasCitation } from "../src/lib/practice/feedback";
import { hashSessionCode, verifySessionCode } from "../src/lib/practice/session-codes";

process.env.USE_SAMPLE_DATA = "1";

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
  const caseRow = store.cases.find((c) => c.active);
  assert(jainam && serena && t1 && t2 && caseRow, "seeded people, teams, case");

  // Chunk loss bound
  assert(maxLossMs() === CHUNK_DURATION_MS, "chunk strategy loses at most 30s");
  assert(CHUNK_DURATION_MS === 30_000, "chunks are 30 seconds");

  // Admin session + hashed code (plaintext only at create)
  const created = await createSession({
    kind: "admin",
    title: "Track 5 check session",
    date: "2026-11-21",
    place: "THH",
    online: false,
    createdBy: jainam!.id,
    rounds: [
      {
        caseId: caseRow!.id,
        caseNumber: caseRow!.number,
        teamIds: [t1!.id, t2!.id],
        sides: { presenting: t1!.id, commenting: t2!.id },
        moderator: "cruxy",
        judges: { humans: [], cruxy: false }, // no human → Cruxy must still score
        mode: "full_round",
      },
    ],
  });
  assert(created.plainCode && created.plainCode.length === 6, "session code issued once");
  assert(created.session.code_hash, "code stored as hash");
  const codeHash = created.session.code_hash!;
  const plainCode = created.plainCode!;
  assert(!codeHash.includes(plainCode), "hash is not plaintext code");
  assert(await verifySessionCode(codeHash, plainCode), "code verifies against hash");

  const joined = await joinWithSessionCode({
    code: plainCode,
    personId: serena!.id,
  });
  assert(joined.ok, "member joins with session code");

  const round = created.rounds[0];
  assert(round, "round created");

  // Chunked upload simulation
  let recording = newRecording(round.id, serena!.id);
  for (let i = 0; i < 3; i++) {
    const saved = await saveChunk({
      roundId: round.id,
      index: i,
      bytes: Buffer.from(`fake-audio-chunk-${i}`),
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
    (await getRecordingForRound(round.id))?.chunk_meta.length === 3,
    "3 chunks uploaded (resume-safe)",
  );
  assert(await audioStillExists(recording), "audio exists before finalize");

  // Finalize: transcript + delete audio + Cruxy judge for every team (no humans)
  const result = await finalizeRound({
    roundId: round.id,
    personId: jainam!.id,
  });
  assert(result.lines.length > 0, "transcript lines saved");
  assert(result.recording.deleted_at, "audio deleted_at set");
  assert(
    result.recording.chunk_paths.length === 0,
    "chunk paths cleared after delete",
  );
  assert(
    !(await audioStillExists(result.recording)),
    "audio is gone after transcription",
  );

  const lines = await getTranscript(round.id);
  assert(lines.length === result.lines.length, "transcript readable");

  assert(result.judgment, "Cruxy judged when no human judge");
  assert(
    result.judgment!.cards.length === 2,
    "Cruxy scores every team in the round",
  );
  assert(
    result.judgment!.cards.every((c) => c.cruxy && c.team_id),
    "cards are Cruxy cards for each team",
  );
  assert(
    result.judgment!.scores.every((s) => s.evidence_line_ids.length >= 1),
    "Cruxy scores carry transcript evidence",
  );

  // Every feedback point links to a transcript line
  for (const f of result.judgment!.feedback) {
    assert(
      feedbackHasCitation(f, lines),
      `feedback ${f.id} links to transcript line`,
    );
  }

  const report = await getReport(round.id);
  assert(report.report?.headline, "report headline stored");
  assert(
    report.feedback.every((f) => f.quote_line_id && lines.some((l) => l.id === f.quote_line_id)),
    "every stored feedback point links to a transcript line",
  );

  // Session code hashing helper
  const h = await hashSessionCode("ABCD12");
  assert(await verifySessionCode(h, "abcd12"), "codes normalize case");

  // AssemblyAI key presence (boolean only — never print value)
  const hasAssembly = Boolean(process.env.ASSEMBLYAI_API_KEY?.trim());
  console.log(
    `ok — ASSEMBLYAI_API_KEY ${hasAssembly ? "present" : "missing (stub path used)"}`,
  );

  console.log("\nAll Track 5 acceptance checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
