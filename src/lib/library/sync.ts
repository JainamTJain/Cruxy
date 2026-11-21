import { randomUUID } from "crypto";
import {
  DriveAccessError,
  extractDriveText,
  listDriveFiles,
} from "@/lib/library/drive";
import { digestListedFile } from "@/lib/library/digest";
import { createProposal } from "@/lib/case-brain/service";
import {
  getLibraryFileByDriveId,
  listCases,
  listTeams,
  replaceFilePassages,
  saveLibraryFile,
  saveSyncRun,
} from "@/lib/db/library-repository";
import { readStore } from "@/lib/db/sample-store";
import { logActivity } from "@/lib/db/repository";
import type { SyncRun } from "@/lib/library/types";
import { nowIso } from "@/lib/utils";

export type SyncOptions = {
  mode: "manual" | "cron" | "sample";
  personId?: string | null;
  /** For tests: force skip AI even on new files (heuristic only). */
  forceHeuristic?: boolean;
};

export type SyncResult = {
  run: SyncRun;
  message: string;
  /** Drive file ids that were newly digested this run. */
  newFileIds: string[];
};

async function resolveActorId(personId?: string | null): Promise<string> {
  if (personId) return personId;
  try {
    const store = await readStore();
    return (
      store.people.find((p) => p.role === "tech_admin")?.id ??
      store.people[0]?.id ??
      "system"
    );
  } catch {
    return "system";
  }
}

/**
 * Nightly / Sync now. Only new or changed files are digested
 * (compare Drive modifiedTime + checksum). Unchanged files → zero AI calls.
 * Never writes to the filesystem; only Supabase (or sample store).
 */
export async function runDriveSync(opts: SyncOptions): Promise<SyncResult> {
  const started = nowIso();
  const runId = randomUUID();
  let filesSeen = 0;
  let filesProcessed = 0;
  let filesSkipped = 0;
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

  for (const file of listed.files) {
    const existing = await getLibraryFileByDriveId(file.drive_id);
    const unchanged =
      existing &&
      existing.checksum === file.checksum &&
      existing.modified_at === file.modified_at &&
      existing.status !== "pending";

    if (unchanged) {
      filesSkipped += 1;
      continue;
    }

    const wasNew = !existing;
    const extracted = await extractDriveText(file);
    if (extracted.stub) stub = true;

    const digested = await digestListedFile({
      listed: file,
      text: extracted.text,
      scannedPdf: extracted.scannedPdf,
      cases,
      existing,
      personId: opts.personId,
      skipAi: opts.forceHeuristic === true,
    });
    aiCalls += digested.aiCalls;
    await saveLibraryFile(digested.file);
    await replaceFilePassages(digested.file.id, digested.passages);
    filesProcessed += 1;
    if (wasNew) newFileIds.push(digested.file.id);

    // Practice transcript ideas → proposals for each team (Truth Source queue)
    const caseId = digested.file.case_ids[0] ?? null;
    if (
      digested.file.type === "practice_transcript" &&
      digested.ideas.length > 0 &&
      caseId
    ) {
      for (const team of teams) {
        for (const idea of digested.ideas) {
          await createProposal({
            teamId: team.id,
            caseId,
            personId: actorId,
            text: idea,
            kind: "other",
            origin: "transcript",
            originRef: digested.file.id,
          });
        }
      }
    }
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
      aiCalls,
      stub,
      mode: opts.mode,
      newFileCount: newFileIds.length,
    },
  });

  const message = stub
    ? `Sync complete (stub). Seen ${filesSeen}, processed ${filesProcessed}, skipped unchanged ${filesSkipped}, AI calls ${aiCalls}. ${notes ?? ""}`.trim()
    : `Sync complete. Seen ${filesSeen}, processed ${filesProcessed}, skipped unchanged ${filesSkipped}, AI calls ${aiCalls}.`;

  return { run, message, newFileIds };
}
