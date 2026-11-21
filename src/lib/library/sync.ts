import { randomUUID } from "crypto";
import { extractDriveText, listDriveFiles } from "@/lib/library/drive";
import { digestListedFile } from "@/lib/library/digest";
import {
  getLibraryFileByDriveId,
  listCases,
  listTeams,
  replaceFilePassages,
  saveLibraryFile,
  saveProposal,
  saveSyncRun,
} from "@/lib/db/library-repository";
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
};

/**
 * Nightly / Sync now. Only new or changed files are digested.
 * Unchanged files → zero AI calls.
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

  const listed = await listDriveFiles();
  stub = listed.stub;
  notes = listed.notes;
  filesSeen = listed.files.length;

  const cases = await listCases();
  const teams = await listTeams();

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

    // Practice transcript ideas → proposals for each team (Truth Source queue)
    if (
      digested.file.type === "practice_transcript" &&
      digested.ideas.length > 0
    ) {
      const caseId = digested.file.case_ids[0] ?? null;
      for (const team of teams) {
        for (const idea of digested.ideas) {
          await saveProposal({
            id: randomUUID(),
            team_id: team.id,
            case_id: caseId,
            origin: "transcript",
            origin_ref: digested.file.id,
            text: idea,
            cruxy_note: null,
            status: "pending",
            created_at: nowIso(),
            created_by: opts.personId ?? null,
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
    },
  });

  const message = stub
    ? `Sync complete (stub). Seen ${filesSeen}, processed ${filesProcessed}, skipped unchanged ${filesSkipped}, AI calls ${aiCalls}. ${notes ?? ""}`.trim()
    : `Sync complete. Seen ${filesSeen}, processed ${filesProcessed}, skipped unchanged ${filesSkipped}, AI calls ${aiCalls}.`;

  return { run, message };
}
