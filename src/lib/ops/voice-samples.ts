import "server-only";
import { isSampleDataMode } from "@/lib/db/config";
import {
  getPersonById,
  listPeopleFull,
  logActivity,
  savePerson,
} from "@/lib/db/repository";
import { removePaths } from "@/lib/ops/storage";

/**
 * Delete one person's voice sample from Storage (or sample path) and clear
 * people.voice_sample_path. Call on consent withdrawal and from admin delete.
 */
export async function deleteVoiceSampleForPerson(opts: {
  personId: string;
  actorId?: string | null;
  reason: "withdrawal" | "season_end" | "admin_delete";
}): Promise<{ deleted: boolean; path: string | null }> {
  const person = await getPersonById(opts.personId);
  if (!person) return { deleted: false, path: null };

  const path = person.voice_sample_path;
  if (path) {
    // Paths may be storage object keys or legacy local paths from early consent.
    const objectKey = storageObjectKey(path, opts.personId);
    try {
      await removePaths("voice-samples", [objectKey]);
    } catch {
      // Object may already be gone; still clear the column.
    }
  }

  person.voice_sample_path = null;
  if (opts.reason === "withdrawal") {
    person.recording_ok = false;
  }
  await savePerson(person);

  await logActivity({
    person_id: opts.actorId ?? opts.personId,
    action: "voice_sample_deleted",
    target: opts.personId,
    meta: { reason: opts.reason, had_path: Boolean(path) },
  });

  return { deleted: Boolean(path), path };
}

/** Season end: delete every voice sample. Aggregate scores stay. */
export async function deleteAllVoiceSamples(opts?: {
  actorId?: string | null;
}): Promise<{ people: number; deleted: number }> {
  const people = await listPeopleFull();
  let deleted = 0;
  for (const p of people) {
    if (!p.voice_sample_path) continue;
    const r = await deleteVoiceSampleForPerson({
      personId: p.id,
      actorId: opts?.actorId ?? null,
      reason: "season_end",
    });
    if (r.deleted) deleted += 1;
  }
  await logActivity({
    person_id: opts?.actorId ?? null,
    action: "voice_samples_season_end",
    target: "all",
    meta: { people: people.length, deleted },
  });
  return { people: people.length, deleted };
}

function storageObjectKey(stored: string, personId: string): string {
  // Prefer a stable key; strip any absolute/legacy local prefix.
  if (stored.includes("voice-samples/")) {
    return stored.split("voice-samples/").pop() ?? `${personId}.webm`;
  }
  if (stored.endsWith(".webm") || stored.endsWith(".mp4") || stored.endsWith(".m4a")) {
    const base = stored.split(/[/\\]/).pop();
    if (base) return base;
  }
  return `${personId}.webm`;
}

/** Suggested storage path when uploading a new sample (consent flow). */
export function voiceSampleObjectPath(personId: string, ext = "webm") {
  return `${personId}.${ext}`;
}

export function isSampleModeVoicePath(path: string | null): boolean {
  return Boolean(path) && isSampleDataMode();
}
