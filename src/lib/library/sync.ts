import { randomUUID } from "crypto";
import {
  DriveAccessError,
  extractDriveText,
  listDriveFiles,
} from "@/lib/library/drive";
import { digestListedFile } from "@/lib/library/digest";
import {
  librarianIdeasToProposals,
  teamFromDrivePath,
} from "@/lib/cruxy/agents/librarian";
import {
  getLibraryFileByDriveId,
  listLibraryFiles,
  listCases,
  listTeams,
  replaceFilePassages,
  saveLibraryFile,
  saveSyncRun,
} from "@/lib/db/library-repository";
import { listPeopleFull, logActivity } from "@/lib/db/repository";
import type { SyncRun } from "@/lib/library/types";
import { nowIso } from "@/lib/utils";

export type SyncOptions = {
  mode: "manual" | "cron" | "sample";
  personId?: string | null;
  /** Time budget in ms before stopping safely (default 240 s). */
  budgetMs?: number;
  /** For tests: force skip AI even on new files (heuristic only). */
  forceHeuristic?: boolean;
};

export type SyncResult = {
  run: SyncRun;
  message: string;
  /** Drive file ids that were newly digested this run. */
  newFileIds: string[];
  filesRemoved?: number;
};

export class SyncBusyError extends Error {
  constructor(
    message = "A Drive sync is already running. Wait for it to finish, then try again.",
  ) {
    super(message);
    this.name = "SyncBusyError";
  }
}

/** One sync at a time per process (manual + cron + upload-triggered). */
let syncInFlight: Promise<SyncResult> | null = null;

async function resolveActorId(personId?: string | null): Promise<string> {
  if (personId) return personId;
  const people = await listPeopleFull();
  return (
    people.find((p) => p.role === "tech_admin")?.id ??
    people[0]?.id ??
    "system"
  );
}

/**
 * Nightly / Sync now. Only new or changed files are digested
 * (compare Drive modifiedTime + checksum). Unchanged files → zero Cruxy calls.
 * Never writes to the filesystem; only Supabase (or sample store).
 */
export async function runDriveSync(opts: SyncOptions): Promise<SyncResult> {
  if (syncInFlight) {
    throw new SyncBusyError();
  }
  syncInFlight = runDriveSyncInner(opts).finally(() => {
    syncInFlight = null;
  });
  return syncInFlight;
}

async function runDriveSyncInner(opts: SyncOptions): Promise<SyncResult> {
  const started = nowIso();
  const runId = randomUUID();
  let filesSeen = 0;
  let filesProcessed = 0;
  let filesSkipped = 0;
  let filesRemoved = 0;
  let aiCalls = 0;
  let stub = false;
  let notes: string | null = null;
  const newFileIds: string[] = [];

  let listed: Awaited<ReturnType<typeof listDriveFiles>>;
  try {
    listed = await listDriveFiles();
  } catch (err) {
    if (err instanceof DriveAccessError) {
      const run: SyncRun = {
        id: runId,
        started_at: started,
        finished_at: nowIso(),
        files_seen: 0,
        files_processed: 0,
        files_skipped_unchanged: 0,
        ai_calls: 0,
        stub: false,
        mode: opts.mode,
        notes: err.message,
      };
      await saveSyncRun(run);
      await logActivity({
        person_id: opts.personId ?? null,
        action: "drive_sync_failed",
        target: runId,
        meta: { code: err.code, message: err.message, mode: opts.mode },
      });
      return {
        run,
        message: err.message,
        newFileIds: [],
        filesRemoved: 0,
      };
    }
    throw err;
  }

  stub = listed.stub;
  notes = listed.notes;
  filesSeen = listed.files.length;

  const cases = await listCases();
  const teams = await listTeams();
  const actorId = await resolveActorId(opts.personId);

  // Stop starting new files after 150 s: one large file can take over a minute to
  // digest, and Vercel kills the function at 300 s before the run is recorded.
  // Unchanged-file skipping makes the next run resume.
  const budgetMs = opts.budgetMs ?? 150_000;
  const startedMs = Date.now();
  let stoppedEarly = false;

  const seenDriveIds = new Set(listed.files.map((f) => f.drive_id));

  for (const file of listed.files) {
    if (Date.now() - startedMs > budgetMs) {
      stoppedEarly = true;
      break;
    }
    const existing = await getLibraryFileByDriveId(file.drive_id);
    const unchanged =
      existing &&
      existing.status !== "removed" &&
      existing.checksum === file.checksum &&
      existing.modified_at === file.modified_at &&
      existing.status !== "pending";

    if (unchanged) {
      filesSkipped += 1;
      continue;
    }

    const wasNew = !existing || existing.status === "removed";
    const extracted = await extractDriveText(file);
    if (extracted.stub) stub = true;

    const digested = await digestListedFile({
      listed: file,
      text: extracted.text,
      scannedPdf: extracted.scannedPdf,
      cases,
      existing: existing?.status === "removed" ? null : existing,
      personId: opts.personId,
      skipAi: opts.forceHeuristic === true || extracted.tooLarge === true,
    });
    aiCalls += digested.aiCalls;
    await saveLibraryFile(digested.file);
    await replaceFilePassages(digested.file.id, digested.passages);
    try {
      const { distillFileSegments } = await import("@/lib/library/segments");
      const { replaceFileSegments } = await import(
        "@/lib/db/supabase/file-segments"
      );
      const segments = distillFileSegments({
        file: digested.file,
        passages: digested.passages,
        caseId: digested.file.case_ids[0] ?? null,
        personId: opts.personId,
      });
      await replaceFileSegments(digested.file.id, segments);
    } catch {
      // Segments are a speed aid; digest still succeeds without them.
    }
    filesProcessed += 1;
    if (wasNew) newFileIds.push(digested.file.id);

    // Librarian → per-team proposals (team notes, research, transcripts).
    // Teams 1 and 2 get content from their own Drive docs when the path names a team.
    if (digested.ideas.length > 0 && !extracted.tooLarge) {
      await librarianIdeasToProposals({
        ideas: digested.ideas.map((idea) => ({
          text: idea.who ? `${idea.who}: ${idea.text}` : idea.text,
          kind: idea.kind,
          citation_ids: idea.citation_ids ?? [],
          strength: idea.strength ?? "normal",
        })),
        fileId: digested.file.id,
        fileType: digested.file.type,
        caseIds: digested.file.case_ids,
        caseNumbers: digested.file.case_numbers,
        cases,
        teams,
        actorId,
        teamFilter: teamFromDrivePath(digested.file.path),
      });
    }
  }

  // Files that left Drive: mark removed so the library list hides them.
  if (!stoppedEarly) {
    const known = await listLibraryFiles({ includeRemoved: true });
    for (const f of known) {
      if (!f.drive_id || f.status === "removed") continue;
      if (seenDriveIds.has(f.drive_id)) continue;
      await saveLibraryFile({ ...f, status: "removed" });
      filesRemoved += 1;
      await logActivity({
        person_id: opts.personId ?? null,
        action: "drive_file_removed",
        target: f.id,
        meta: { drive_id: f.drive_id, name: f.name, mode: opts.mode },
      });
    }
  }

  if (stoppedEarly) {
    notes = [
      notes,
      `Stopped early to stay inside the time limit after ${filesProcessed} files; the next run continues from here.`,
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (filesRemoved > 0) {
    notes = [notes, `Removed ${filesRemoved} file(s) no longer in Drive.`]
      .filter(Boolean)
      .join(" ");
  }

  const run: SyncRun = {
    id: runId,
    started_at: started,
    finished_at: nowIso(),
    files_seen: filesSeen,
    files_processed: filesProcessed,
    files_skipped_unchanged: filesSkipped,
    ai_calls: aiCalls,
    stub,
    mode: opts.mode,
    notes,
  };
  await saveSyncRun(run);
  await logActivity({
    person_id: opts.personId ?? null,
    action: "drive_sync",
    target: runId,
    meta: {
      filesSeen,
      filesProcessed,
      filesSkipped,
      filesRemoved,
      aiCalls,
      stub,
      mode: opts.mode,
      newFileCount: newFileIds.length,
    },
  });

  // Wave 7: close material requests when a matching file lands in Drive.
  let materialsFulfilled = 0;
  try {
    const { fulfillMaterialRequestsFromFiles } = await import(
      "@/lib/db/supabase/material-requests-extra"
    );
    const allFiles = await listLibraryFiles();
    const candidates = allFiles.filter(
      (f) => newFileIds.includes(f.id) || filesProcessed > 0,
    );
    materialsFulfilled = await fulfillMaterialRequestsFromFiles(
      candidates.map((f) => ({
        id: f.id,
        drive_id: f.drive_id,
        name: f.name,
        path: f.path,
      })),
    );
  } catch {
    /* migration 00040 may not be applied yet */
  }

  // Wave 8 C: re-read linked Team Brief docs (Crux never writes to them).
  let briefsSynced = 0;
  let briefsUnchanged = 0;
  try {
    const { syncAllOwnDocBriefs } = await import(
      "@/lib/case-brain/team-brief"
    );
    const briefSync = await syncAllOwnDocBriefs();
    briefsSynced = briefSync.synced;
    briefsUnchanged = briefSync.unchanged;
    if (briefSync.errors.length) {
      notes = [
        notes,
        `Brief sync notes: ${briefSync.errors.slice(0, 3).join("; ")}`,
      ]
        .filter(Boolean)
        .join(" ");
    }
  } catch {
    /* migration 00050 may not be applied yet */
  }

  const message = stub
    ? `Sync complete (stub). Seen ${filesSeen}, processed ${filesProcessed}, skipped unchanged ${filesSkipped}, Cruxy calls ${aiCalls}${filesRemoved ? `, removed ${filesRemoved}` : ""}. ${notes ?? ""}`.trim()
    : `Sync complete. Seen ${filesSeen}, processed ${filesProcessed}, skipped unchanged ${filesSkipped}, Cruxy calls ${aiCalls}${filesRemoved ? `, removed ${filesRemoved}` : ""}${materialsFulfilled ? `, material requests closed ${materialsFulfilled}` : ""}${briefsSynced || briefsUnchanged ? `, team briefs re-read ${briefsSynced} (unchanged ${briefsUnchanged})` : ""}.`;

  return { run, message, newFileIds, filesRemoved };
}
