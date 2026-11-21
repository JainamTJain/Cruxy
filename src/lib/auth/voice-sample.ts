import "server-only";
import { uploadBytes } from "@/lib/ops/storage";
import { deleteVoiceSampleForPerson } from "@/lib/ops/voice-samples";

function objectKey(personId: string): string {
  return `${personId}.webm`;
}

/**
 * Upload a voice sample through Workstream I's Storage helper.
 * Returns a durable path key (never a local absolute path on Vercel).
 */
export async function uploadVoiceSample(
  personId: string,
  bytes: Buffer,
  contentType = "audio/webm",
): Promise<string> {
  const key = objectKey(personId);
  await uploadBytes({
    bucket: "voice-samples",
    path: key,
    bytes,
    contentType,
    upsert: true,
  });
  return `storage:voice-samples/${key}`;
}

/** Withdraw / delete: delegates to Workstream I's privacy helper. */
export async function deleteVoiceSample(
  voiceSamplePath: string | null | undefined,
  personId?: string,
): Promise<void> {
  if (!voiceSamplePath) return;
  if (personId) {
    await deleteVoiceSampleForPerson({
      personId,
      reason: "withdrawal",
    });
    return;
  }
  // Path-only fallback: strip storage: prefix and remove via ops storage.
  const { removePaths } = await import("@/lib/ops/storage");
  let key = voiceSamplePath;
  if (key.startsWith("storage:voice-samples/")) {
    key = key.slice("storage:voice-samples/".length);
  } else if (key.includes("voice-samples/")) {
    key = key.split("voice-samples/").pop() ?? key;
  }
  await removePaths("voice-samples", [key]);
}
