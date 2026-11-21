import "server-only";
import { isSampleDataMode } from "@/lib/db/config";
import { logActivity } from "@/lib/db/repository";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { listPrefix, removePaths } from "@/lib/ops/storage";
import { nowIso } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;

export type AudioCleanupResult = {
  recordingsCleared: number;
  objectsRemoved: number;
  sampleMode: boolean;
};

/**
 * Nightly backstop: delete any practice audio older than 24 hours.
 * Rows stay; chunk_paths cleared and deleted_at set. Never writes the Vercel FS.
 */
export async function runAudioBackstopCleanup(
  olderThanMs = DAY_MS,
): Promise<AudioCleanupResult> {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();

  if (isSampleDataMode()) {
    const store = await readStore();
    let recordingsCleared = 0;
    let objectsRemoved = 0;
    await updateStore((s) => {
      for (const rec of s.recordings) {
        if (rec.deleted_at) continue;
        if (rec.created_at >= cutoff) continue;
        objectsRemoved += rec.chunk_paths.length;
        rec.chunk_paths = [];
        rec.chunk_meta = [];
        rec.deleted_at = nowIso();
        rec.status = "ready";
        recordingsCleared += 1;
      }
    });
    // Also drop any leftover sample storage under audio-chunks
    const listed = await listPrefix("audio-chunks", "");
    if (listed.length) {
      await removePaths(
        "audio-chunks",
        listed.map((f) => f.name),
      );
      objectsRemoved += listed.length;
    }
    await logActivity({
      person_id: null,
      action: "audio_backstop_cleanup",
      target: "recordings",
      meta: {
        recordingsCleared,
        objectsRemoved,
        cutoff,
        sample: true,
        storeSize: store.recordings.length,
      },
    });
    return { recordingsCleared, objectsRemoved, sampleMode: true };
  }

  const sb = getServiceSupabase();
  const { data: rows, error } = await sb
    .from("recordings")
    .select("id, round_id, chunk_paths, deleted_at, created_at")
    .is("deleted_at", null)
    .lt("created_at", cutoff);
  if (error) throw new Error(`audioCleanup.list: ${error.message}`);

  let recordingsCleared = 0;
  let objectsRemoved = 0;

  for (const row of rows ?? []) {
    const paths = (row.chunk_paths as string[] | null) ?? [];
    const keys = paths
      .map((p) => toAudioObjectKey(p, row.round_id as string))
      .filter(Boolean) as string[];
    if (keys.length) {
      const r = await removePaths("audio-chunks", keys);
      objectsRemoved += r.removed;
    }
    const { error: upErr } = await sb
      .from("recordings")
      .update({
        chunk_paths: [],
        deleted_at: nowIso(),
        status: "ready",
      })
      .eq("id", row.id);
    if (upErr) throw new Error(`audioCleanup.update: ${upErr.message}`);
    recordingsCleared += 1;
  }

  // Orphan objects under audio-chunks older than cutoff (by updated_at)
  const orphans = await listPrefix("audio-chunks", "");
  const staleOrphans = orphans.filter((f) => {
    if (!f.updatedAt) return false;
    return f.updatedAt < cutoff;
  });
  if (staleOrphans.length) {
    const r = await removePaths(
      "audio-chunks",
      staleOrphans.map((f) => f.name),
    );
    objectsRemoved += r.removed;
  }

  await logActivity({
    person_id: null,
    action: "audio_backstop_cleanup",
    target: "recordings",
    meta: { recordingsCleared, objectsRemoved, cutoff },
  });

  return { recordingsCleared, objectsRemoved, sampleMode: false };
}

function toAudioObjectKey(
  stored: string,
  roundId: string,
): string | null {
  if (!stored) return null;
  if (stored.startsWith("http://") || stored.startsWith("https://")) {
    try {
      const u = new URL(stored);
      const parts = u.pathname.split("/audio-chunks/");
      if (parts[1]) return decodeURIComponent(parts[1]);
    } catch {
      /* fall through */
    }
  }
  if (stored.includes("audio-chunks/")) {
    return stored.split("audio-chunks/").pop() ?? null;
  }
  // Absolute local paths from early Track 5 → map to round/filename
  const base = stored.split(/[/\\]/).pop();
  if (base) return `${roundId}/${base}`;
  return null;
}
