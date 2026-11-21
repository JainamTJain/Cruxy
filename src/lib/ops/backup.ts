import "server-only";
import { isSampleDataMode } from "@/lib/db/config";
import { logActivity } from "@/lib/db/repository";
import { dumpStoreForAdmin } from "@/lib/db/repository";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { uploadBytes } from "@/lib/ops/storage";
import { nowIso } from "@/lib/utils";

/** Key tables for a weekly logical backup. */
export const BACKUP_TABLES = [
  "people",
  "teams",
  "team_memberships",
  "cases",
  "competitions",
  "claims",
  "supports",
  "backings",
  "counterclaims",
  "truth_items",
  "proposals",
  "decisions",
  "one_pagers",
  "flashcards",
  "questions",
  "answers",
  "sessions",
  "rounds",
  "attendance",
  "transcript_lines",
  "judge_cards",
  "card_scores",
  "feedback_items",
  "bank_entries",
  "ai_calls",
  "activity_log",
  "comments",
  "highlights",
  "files",
  "passages",
] as const;

export type BackupResult = {
  ok: boolean;
  storagePath: string;
  byteSize: number;
  tableCounts: Record<string, number>;
  sampleMode: boolean;
};

/**
 * Weekly logical backup of key tables → Supabase Storage `backups` bucket.
 * JSON dump (no Vercel filesystem). Sample mode dumps the in-memory store.
 */
export async function runWeeklyLogicalBackup(): Promise<BackupResult> {
  const stamp = nowIso().replace(/[:.]/g, "-");
  const storagePath = `weekly/${stamp}.json`;
  const tableCounts: Record<string, number> = {};

  let payload: unknown;

  if (isSampleDataMode()) {
    const store = await dumpStoreForAdmin();
    for (const key of Object.keys(store) as (keyof typeof store)[]) {
      const val = store[key];
      if (Array.isArray(val)) tableCounts[key] = val.length;
    }
    payload = {
      kind: "crux-logical-backup",
      at: nowIso(),
      sample: true,
      tables: store,
    };
  } else {
    const sb = getServiceSupabase();
    const tables: Record<string, unknown[]> = {};
    for (const table of BACKUP_TABLES) {
      const { data, error } = await sb.from(table).select("*");
      if (error) {
        // Table may not exist yet on a partial migrate — skip, don't fail the rest.
        tableCounts[table] = -1;
        continue;
      }
      tables[table] = data ?? [];
      tableCounts[table] = tables[table].length;
    }
    payload = {
      kind: "crux-logical-backup",
      at: nowIso(),
      sample: false,
      tables,
    };
  }

  const text = JSON.stringify(payload);
  const bytes = Buffer.from(text, "utf8");
  await uploadBytes({
    bucket: "backups",
    path: storagePath,
    bytes,
    contentType: "application/json",
    upsert: true,
  });

  if (!isSampleDataMode()) {
    const sb = getServiceSupabase();
    await sb.from("backup_runs").insert({
      storage_path: storagePath,
      byte_size: bytes.length,
      table_counts: tableCounts,
      ok: true,
    });
  }

  await logActivity({
    person_id: null,
    action: "weekly_logical_backup",
    target: storagePath,
    meta: { byteSize: bytes.length, tableCounts },
  });

  return {
    ok: true,
    storagePath,
    byteSize: bytes.length,
    tableCounts,
    sampleMode: isSampleDataMode(),
  };
}
