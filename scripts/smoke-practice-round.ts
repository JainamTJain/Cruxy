/**
 * Wave 4: prove a full practice round end to end.
 *
 * Always runs a sample-data path (record → stub/live transcript → Cruxy judge
 * → report → bank → home "rounds graded" moves).
 *
 * When ASSEMBLYAI_API_KEY and AI_GATEWAY_API_KEY are set, also runs the live
 * transcription + strong-tier judge path on fixtures/practice/short-round.wav.
 *
 * Run: npm run smoke:practice
 * Never prints secret values.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resetSampleStore, readStore } from "../src/lib/db/sample-store";
import { getProgramTotals } from "../src/lib/db/repository";
import {
  createSession,
  getRecordingForRound,
  getReport,
  getTranscript,
  listBankEntries,
  saveRecording,
  upsertAttendance,
} from "../src/lib/db/practice-repository";
import {
  clearSampleChunkBytes,
  newRecording,
  saveChunk,
  audioStillExists,
} from "../src/lib/practice/recording";
import { finalizeRound } from "../src/lib/practice/pipeline";
import { feedbackHasCitation } from "../src/lib/practice/feedback";

process.env.USE_SAMPLE_DATA = "1";
// Sample path must stay deterministic even when CI has AI_GATEWAY_API_KEY set.
// Live AssemblyAI + judge path (below) still uses real keys when present.
process.env.CRUXY_USE_FIXTURES = process.env.CRUXY_USE_FIXTURES || "1";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

function hasKey(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

async function runRound(opts: {
  label: string;
  audio: Buffer;
  requireLive: boolean;
  forceGatewayStub?: boolean;
}) {
  clearSampleChunkBytes();
  await resetSampleStore();
  const store = await readStore();
  const jainam = store.people.find((p) => p.name === "Jainam");
  const katie = store.people.find((p) => p.name.startsWith("Katie"));
  const t1 = store.teams.find((t) => t.name === "Team 1");
  const t3 = store.teams.find((t) => t.name === "Team 3");
  const caseRow = store.cases.find((c) => c.number === 9) ?? store.cases.find((c) => c.active);
  assert(jainam && katie && t1 && t3 && caseRow, `${opts.label}: seed people/teams/case`);

  const before = await getProgramTotals();
  // Count bank rows that cite this run's lines later; seed fixtures already
  // include one bank entry, so a raw length compare flakes when bankAdded is 0
  // under a non-deterministic live judge.
  const bankBeforeIds = new Set((await listBankEntries()).map((b) => b.id));

  const created = await createSession({
    kind: "admin",
    title: `Wave 4 smoke (${opts.label})`,
    date: "2026-11-21",
    place: "THH 209",
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
  const round = created.rounds[0];
  assert(round, `${opts.label}: round created`);

  // Attendance so speaker labels can map to people
  await upsertAttendance({
    sessionId: created.session.id,
    personId: katie!.id,
    status: "present",
    source: "join",
  });
  await upsertAttendance({
    sessionId: created.session.id,
    personId: jainam!.id,
    status: "present",
    source: "join",
  });

  let recording = newRecording(round.id, katie!.id);
  const saved = await saveChunk({
    roundId: round.id,
    index: 0,
    bytes: opts.audio,
    contentType: "audio/wav",
    ext: "wav",
  });
  recording.chunk_paths = [saved.path];
  recording.chunk_meta = [
    { index: 0, bytes: saved.bytes, uploaded_at: new Date().toISOString() },
  ];
  await saveRecording(recording);
  assert(
    (await getRecordingForRound(round.id))?.chunk_meta.length === 1,
    `${opts.label}: audio chunk stored in storage path`,
  );
  assert(await audioStillExists(recording), `${opts.label}: audio exists before finalize`);

  const result = await finalizeRound({
    roundId: round.id,
    personId: jainam!.id,
    forceCruxy: true,
    requireLive: opts.requireLive,
  });

  assert(result.lines.length > 0, `${opts.label}: transcript lines saved`);
  if (opts.requireLive) {
    assert(!result.transcriptStub, `${opts.label}: AssemblyAI live (not stub)`);
  }
  assert(result.recording.deleted_at, `${opts.label}: audio deleted after transcript`);
  assert(
    !(await audioStillExists(result.recording)),
    `${opts.label}: audio gone from storage`,
  );

  assert(result.judgment, `${opts.label}: Cruxy judged`);
  assert(
    result.judgment!.cards.length >= 1,
    `${opts.label}: at least one Cruxy card`,
  );
  assert(
    result.judgment!.scores.every((s) => s.evidence_line_ids.length >= 1),
    `${opts.label}: every score has quoted evidence line ids`,
  );

  // Prefer finalize's in-memory lines (authoritative for this judgment), then
  // persisted rows. Avoid mixing fixture lines from other rounds.
  const stored = await getTranscript(round.id);
  const lineIds = new Set(result.lines.map((l) => l.id));
  const lines =
    result.lines.length > 0
      ? result.lines
      : stored.filter((l) => l.round_id === round.id);
  assert(lines.length > 0, `${opts.label}: transcript lines readable after judge`);
  for (const f of result.judgment!.feedback) {
    assert(
      feedbackHasCitation(f, lines),
      `${opts.label}: feedback cites a transcript line`,
    );
  }

  const report = await getReport(round.id);
  assert(report.report?.headline, `${opts.label}: feedback report stored`);

  const bankAfter = await listBankEntries();
  const newBank = bankAfter.filter((b) => !bankBeforeIds.has(b.id));
  const bankForThisRound = newBank.filter(
    (b) => b.example_line_id && lineIds.has(b.example_line_id),
  );
  assert(
    result.bankAdded >= 1 || bankForThisRound.length >= 1,
    `${opts.label}: Things to take care of bank grew for this round (bankAdded=${result.bankAdded}, new=${bankForThisRound.length})`,
  );

  const after = await getProgramTotals();
  assert(
    after.rounds_graded > before.rounds_graded,
    `${opts.label}: home rounds graded moved (${before.rounds_graded} → ${after.rounds_graded})`,
  );

  return result;
}

async function main() {
  const fixturePath = join(
    process.cwd(),
    "fixtures/practice/short-round.wav",
  );
  assert(existsSync(fixturePath), "fixtures/practice/short-round.wav present");
  const wav = readFileSync(fixturePath);

  // Path A: always (sample store + storage helpers + fixture judge).
  process.env.CRUXY_USE_FIXTURES = "1";
  await runRound({
    label: "sample",
    audio: Buffer.from("fake-chunk-for-stub-transcript"),
    requireLive: false,
  });

  const hasAssembly = hasKey("ASSEMBLYAI_API_KEY");
  const hasGateway = hasKey("AI_GATEWAY_API_KEY");
  console.log(
    `keys — ASSEMBLYAI_API_KEY ${hasAssembly ? "present" : "missing"}, AI_GATEWAY_API_KEY ${hasGateway ? "present" : "missing"}`,
  );

  if (!hasAssembly || !hasGateway) {
    console.log(
      "skip — live AssemblyAI + Cruxy path (set both keys to exercise it)",
    );
    console.log("\nsmoke-practice-round: ok (sample path)");
    return;
  }

  // Path B: real audio fixture → AssemblyAI speaker labels → strong-tier judge.
  delete process.env.CRUXY_USE_FIXTURES;
  await runRound({
    label: "live",
    audio: wav,
    requireLive: true,
  });

  console.log("\nsmoke-practice-round: ok (sample + live)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
