import "server-only";
import { isSampleDataMode } from "@/lib/db/config";
import {
  dumpStoreForAdmin,
  getPersonById,
  listPeopleFull,
  logActivity,
} from "@/lib/db/repository";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { BACKUP_TABLES } from "@/lib/ops/backup";
import {
  createSignedDownloadUrl,
  uploadBytes,
} from "@/lib/ops/storage";
import { deleteAllVoiceSamples } from "@/lib/ops/voice-samples";
import { nowIso } from "@/lib/utils";

export type SeasonExportResult = {
  seasonLabel: string;
  storagePath: string;
  byteSize: number;
  downloadUrl: string | null;
  tableCounts: Record<string, number>;
  voiceSamplesDeleted: number;
  /** Drive SA is read-only: admin must download this archive and place it. */
  driveNote: string;
};

const DRIVE_NOTE =
  "The Drive service account is read-only, so Crux cannot write the archive into Drive. Download this file and put it in the Ethics Bowl folder yourself.";

/**
 * Season-end export archive for the admin: dump key tables to Storage,
 * optionally delete voice samples and old transcripts, return a signed URL.
 */
export async function runSeasonEndExport(opts: {
  actorId: string;
  seasonLabel: string;
  deleteVoiceSamples?: boolean;
  deleteOldTranscripts?: boolean;
  keepTranscripts?: boolean;
}): Promise<SeasonExportResult> {
  const actor = await getPersonById(opts.actorId);
  if (!actor || (actor.role !== "tech_admin" && actor.role !== "coach_admin")) {
    throw new Error("Only admins can run a season-end export");
  }

  const tableCounts: Record<string, number> = {};
  let tables: Record<string, unknown> = {};

  if (isSampleDataMode()) {
    const store = await dumpStoreForAdmin();
    tables = store as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(store)) {
      if (Array.isArray(v)) tableCounts[k] = v.length;
    }
  } else {
    const sb = getServiceSupabase();
    const out: Record<string, unknown[]> = {};
    for (const table of BACKUP_TABLES) {
      const { data, error } = await sb.from(table).select("*");
      if (error) {
        tableCounts[table] = -1;
        continue;
      }
      out[table] = data ?? [];
      tableCounts[table] = out[table].length;
    }
    // people emails are included for the admin archive only
    const people = await listPeopleFull();
    out.people_full = people;
    tableCounts.people_full = people.length;
    tables = out;
  }

  const stamp = nowIso().replace(/[:.]/g, "-");
  const safeLabel = opts.seasonLabel.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 64);
  const storagePath = `season/${safeLabel}-${stamp}.json`;
  const payload = {
    kind: "crux-season-export",
    seasonLabel: opts.seasonLabel,
    at: nowIso(),
    exportedBy: opts.actorId,
    driveNote: DRIVE_NOTE,
    tables,
  };
  const bytes = Buffer.from(JSON.stringify(payload), "utf8");
  await uploadBytes({
    bucket: "backups",
    path: storagePath,
    bytes,
    contentType: "application/json",
    upsert: true,
  });

  if (!isSampleDataMode()) {
    const sb = getServiceSupabase();
    await sb.from("season_exports").insert({
      season_label: opts.seasonLabel,
      storage_path: storagePath,
      byte_size: bytes.length,
      table_counts: tableCounts,
      created_by: opts.actorId,
    });
  }

  let voiceSamplesDeleted = 0;
  if (opts.deleteVoiceSamples !== false) {
    const v = await deleteAllVoiceSamples({ actorId: opts.actorId });
    voiceSamplesDeleted = v.deleted;
  }

  if (opts.deleteOldTranscripts && !opts.keepTranscripts) {
    await deleteSeasonTranscripts(opts.actorId);
  }

  const downloadUrl = await createSignedDownloadUrl("backups", storagePath, 60 * 60 * 24);

  await logActivity({
    person_id: opts.actorId,
    action: "season_end_export",
    target: storagePath,
    meta: {
      seasonLabel: opts.seasonLabel,
      byteSize: bytes.length,
      voiceSamplesDeleted,
      deleteOldTranscripts: Boolean(opts.deleteOldTranscripts),
    },
  });

  return {
    seasonLabel: opts.seasonLabel,
    storagePath,
    byteSize: bytes.length,
    downloadUrl,
    tableCounts,
    voiceSamplesDeleted,
    driveNote: DRIVE_NOTE,
  };
}

async function deleteSeasonTranscripts(actorId: string) {
  if (isSampleDataMode()) {
    const { updateStore } = await import("@/lib/db/sample-store");
    let removed = 0;
    await updateStore((s) => {
      removed = s.transcript_lines.length;
      s.transcript_lines = [];
    });
    await logActivity({
      person_id: actorId,
      action: "season_transcripts_deleted",
      target: "transcript_lines",
      meta: { removed, sample: true },
    });
    return;
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("transcript_lines")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000")
    .select("id");
  if (error) throw new Error(`season transcripts: ${error.message}`);
  await logActivity({
    person_id: actorId,
    action: "season_transcripts_deleted",
    target: "transcript_lines",
    meta: { removed: data?.length ?? 0 },
  });
}
