import { config } from "dotenv";
config({ path: ".env.local" });
/**
 * Admin / coach / library / settings robustness checks (sample mode).
 * Run: npm run check:admin-library
 * Never prints secret env values.
 */
import { resetSampleStore, readStore, updateStore } from "../src/lib/db/sample-store";
import {
  listLibraryFiles,
  getLibraryFileByDriveId,
} from "../src/lib/db/library-repository";
import { runDriveSync, SyncBusyError } from "../src/lib/library/sync";
import { canRead, canWrite } from "../src/lib/admin/permissions";
import {
  requireAdmin,
  requireTechAdmin,
} from "../src/lib/auth/require-session";
import type { SessionPayload } from "../src/lib/types";
import { MAX_DRIVE_FILE_BYTES } from "../src/lib/library/types";
import { inferUnreadableReason } from "../src/lib/library/unreadable";

process.env.USE_SAMPLE_DATA = "1";
delete process.env.DRIVE_ROOT_FOLDER_ID;

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`ok — ${msg}`);
}

function sessionFor(
  personId: string,
  role: SessionPayload["role"],
  adminView: boolean,
  name: string,
): SessionPayload {
  return {
    personId,
    role,
    name,
    teamId: null,
    adminView,
    mustConsent: false,
    mustSetLearningProfile: false,
    mustChoosePasscode: false,
    sessionVersion: 1,
  };
}

async function main() {
  await resetSampleStore();
  const store = await readStore();
  const jainam = store.people.find((p) => p.name === "Jainam");
  const drB = store.people.find((p) => p.name === "Dr. B");
  const serena = store.people.find((p) => p.name === "Serena");
  assert(jainam && drB && serena, "seeded Jainam, Dr. B, Serena");

  // Permission matrix (helpers used by routes)
  assert(canWrite("tech_admin", "passcodes"), "tech can write passcodes");
  assert(!canWrite("coach_admin", "passcodes"), "coach cannot write passcodes");
  assert(!canWrite("coach_admin", "spend"), "coach cannot write spend");
  assert(!canRead("coach_admin", "spend"), "coach cannot read spend");
  assert(canWrite("tech_admin", "book_requests"), "tech can write books");
  assert(!canWrite("coach_admin", "book_requests"), "coach cannot write books");
  assert(
    canRead("coach_admin", "activity_log") &&
      !canWrite("coach_admin", "activity_log"),
    "coach activity log is read-only",
  );
  assert(canWrite("coach_admin", "weekly_summary"), "coach can weekly summary");

  // requireTechAdmin / requireAdmin honour Admin switch
  assert(
    requireTechAdmin(sessionFor(jainam!.id, "tech_admin", true, "Jainam")) ===
      null,
    "tech + adminView allowed",
  );
  assert(
    requireTechAdmin(sessionFor(jainam!.id, "tech_admin", false, "Jainam")) !==
      null,
    "tech without adminView blocked",
  );
  assert(
    requireTechAdmin(sessionFor(drB!.id, "coach_admin", true, "Dr. B")) !==
      null,
    "coach blocked from tech admin",
  );
  assert(
    requireAdmin(sessionFor(drB!.id, "coach_admin", true, "Dr. B")) === null,
    "coach + adminView allowed for admin routes",
  );
  assert(
    requireAdmin(sessionFor(drB!.id, "coach_admin", false, "Dr. B")) !== null,
    "coach without adminView blocked",
  );
  assert(
    requireAdmin(sessionFor(serena!.id, "member", false, "Serena")) !== null,
    "member blocked from admin routes",
  );

  // Drive sync: first run digests; removed file is marked removed
  const first = await runDriveSync({ mode: "sample", personId: jainam!.id });
  assert(first.run.files_processed > 0, "first sync processed files");
  const before = await listLibraryFiles();
  assert(before.length > 0, "library has files after sync");
  const victim = before.find((f) => f.drive_id)?.drive_id;
  assert(victim, "at least one file has a drive_id");

  // Simulate Drive removal by marking a file as present then reconciling
  // against a sync that no longer lists it: drop it from sample listing via
  // temporary checksum change path is not enough; call sync after deleting
  // the drive_id match by renaming drive_id on the stored file's twin.
  await updateStore((s) => {
    const f = s.files.find((x) => x.drive_id === victim);
    if (f) f.drive_id = `gone-${victim}`;
  });
  // Put a phantom library row that points at a drive id sample list never has
  await updateStore((s) => {
    const base = s.files[0];
    if (!base) return;
    s.files.push({
      ...base,
      id: "00000000-0000-4000-8000-00000000dead",
      drive_id: "drive-id-that-does-not-exist-in-sample",
      name: "Removed from Drive.doc",
      status: "digested",
      checksum: "phantom-checksum",
    });
  });

  const afterRemove = await runDriveSync({
    mode: "sample",
    personId: jainam!.id,
  });
  assert(
    (afterRemove.filesRemoved ?? 0) >= 1,
    "sync marks files missing from Drive as removed",
  );
  const visible = await listLibraryFiles();
  assert(
    !visible.some((f) => f.drive_id === "drive-id-that-does-not-exist-in-sample"),
    "removed files hidden from library list",
  );
  const allIncluding = await listLibraryFiles({ includeRemoved: true });
  const marked = allIncluding.find(
    (f) => f.drive_id === "drive-id-that-does-not-exist-in-sample",
  );
  assert(marked?.status === "removed", "phantom file status is removed");

  // Concurrent sync lock
  let busyHit = false;
  const p1 = runDriveSync({ mode: "sample", personId: jainam!.id });
  try {
    await runDriveSync({ mode: "sample", personId: jainam!.id });
  } catch (err) {
    busyHit = err instanceof SyncBusyError;
  }
  await p1;
  assert(busyHit, "overlapping sync throws SyncBusyError");

  // Large-file / too_large classifier
  assert(
    MAX_DRIVE_FILE_BYTES === 40 * 1024 * 1024,
    "40 MB Drive size cap is set",
  );
  assert(
    inferUnreadableReason({
      scannedPdf: false,
      mime: "application/pdf",
      name: "huge.pdf",
      text: "[Too large to digest (55 MB): huge.pdf]",
    }) === "too_large",
    "too_large unreadable reason detected",
  );
  assert(
    inferUnreadableReason({
      scannedPdf: true,
      mime: "application/pdf",
      name: "scan.pdf",
      text: "[Scanned PDF flagged for Jainam: scan.pdf]",
    }) === "scanned_pdf",
    "scanned_pdf still detected",
  );

  // Restored drive_id lookup still works for a live sample file
  const live = await getLibraryFileByDriveId("sample-case-set-2026");
  assert(live && live.status !== "removed", "sample case set still listed");

  console.log("\nAll admin/library robustness checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
