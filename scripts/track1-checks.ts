import { config } from "dotenv";
config({ path: ".env.local" });
/**
 * Track 1 Library acceptance checks (sample-data path).
 * Run: npm run check:track1
 * Never prints secret env values.
 */
import { resetSampleStore } from "../src/lib/db/sample-store";
import {
  countAiCallsSince,
  getLibraryFile,
  listPassagesForFile,
  listSortingQueue,
  listLibraryFiles,
} from "../src/lib/db/library-repository";
import { runDriveSync } from "../src/lib/library/sync";
import { runNightlyResearch } from "../src/lib/library/researcher";
import { listBookRequests } from "../src/lib/db/library-repository";
import { SORTING_CONFIDENCE_THRESHOLD } from "../src/lib/library/types";

process.env.USE_SAMPLE_DATA = "1";
// Ensure Drive stub path for deterministic checks
delete process.env.DRIVE_ROOT_FOLDER_ID;

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

async function main() {
  await resetSampleStore();

  const first = await runDriveSync({ mode: "sample", personId: null });
  assert(first.run.files_processed > 0, "first sync processed files");
  assert(first.run.stub, "Drive stub when folder id missing");

  const files = await listLibraryFiles();
  assert(files.length > 0, "library has files after sync");

  // Every passage links back to Drive file + anchor
  for (const f of files) {
    const passages = await listPassagesForFile(f.id);
    assert(passages.length > 0, `file ${f.name} has passages`);
    for (const p of passages) {
      assert(p.file_id === f.id, "passage.file_id matches file");
      assert(Boolean(p.anchor), "passage has anchor");
      assert(
        p.drive_id === f.drive_id,
        "passage.drive_id matches file.drive_id",
      );
      const again = await getLibraryFile(p.file_id);
      assert(again?.drive_id === f.drive_id, "passage links to Drive file");
    }
  }

  const queue = await listSortingQueue();
  assert(queue.length > 0, "sorting queue shows low-confidence files");
  assert(
    queue.every(
      (f) =>
        f.status === "sorting_queue" ||
        (f.confidence != null &&
          f.confidence < SORTING_CONFIDENCE_THRESHOLD),
    ),
    "queue entries are under confidence threshold or sorting_queue",
  );

  const beforeSecond = new Date().toISOString();
  // Tiny delay so ai_calls timestamps are strictly after marker if any appear
  await new Promise((r) => setTimeout(r, 20));
  const second = await runDriveSync({ mode: "sample", personId: null });
  assert(
    second.run.files_processed === 0,
    "second sync processes zero changed files",
  );
  assert(
    second.run.files_skipped_unchanged === first.run.files_seen,
    "second sync skips all unchanged files",
  );
  assert(second.run.ai_calls === 0, "unchanged re-sync makes zero AI calls");
  const aiAfter = await countAiCallsSince(beforeSecond);
  assert(aiAfter === 0, "no ai_calls rows logged on unchanged re-sync");

  const research = await runNightlyResearch({
    personId: null,
    caseNumbers: [12],
  });
  assert(research.runs.length === 1, "research run for Case 12");
  assert(research.proposalsCreated > 0, "research posts proposal cards");
  const books = await listBookRequests();
  assert(books.length > 0, "book request filed for tech admin");

  console.log("\nAll Track 1 acceptance checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
