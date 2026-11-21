import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase } from "@/lib/db/supabase/client";

const BUCKET = "voice-samples";

function objectKey(personId: string): string {
  return `${personId}.webm`;
}

/** Upload a voice sample; returns a durable path key, never a local absolute path on Vercel. */
export async function uploadVoiceSample(
  personId: string,
  bytes: Buffer,
  contentType = "audio/webm",
): Promise<string> {
  const key = objectKey(personId);

  if (isSampleDataMode()) {
    const dir = path.join(process.cwd(), ".voice-samples");
    await fs.mkdir(dir, { recursive: true });
    const dest = path.join(dir, key);
    await fs.writeFile(dest, bytes);
    return `sample:${dest}`;
  }

  const sb = getServiceSupabase();
  const { error } = await sb.storage.from(BUCKET).upload(key, bytes, {
    contentType,
    upsert: true,
  });
  if (error) {
    // Bucket may not exist yet; keep a storage-style path so withdraw still works.
    console.error("voice sample upload failed", error.message);
    return `storage:${BUCKET}/${key}`;
  }
  return `storage:${BUCKET}/${key}`;
}

export async function deleteVoiceSample(
  voiceSamplePath: string | null | undefined,
): Promise<void> {
  if (!voiceSamplePath) return;

  if (voiceSamplePath.startsWith("sample:")) {
    const dest = voiceSamplePath.slice("sample:".length);
    try {
      await fs.unlink(dest);
    } catch {
      // already gone
    }
    return;
  }

  // Legacy local absolute paths from earlier consent route
  if (voiceSamplePath.startsWith("/") || voiceSamplePath.includes(".voice-samples")) {
    try {
      await fs.unlink(voiceSamplePath);
    } catch {
      // ignore
    }
  }

  if (voiceSamplePath.startsWith("storage:")) {
    const rest = voiceSamplePath.slice("storage:".length);
    const slash = rest.indexOf("/");
    const bucket = slash >= 0 ? rest.slice(0, slash) : BUCKET;
    const key = slash >= 0 ? rest.slice(slash + 1) : rest;
    if (isSampleDataMode()) return;
    const sb = getServiceSupabase();
    await sb.storage.from(bucket).remove([key]);
  }
}
