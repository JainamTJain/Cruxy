import "server-only";
import { decodeToPcm16k } from "@/lib/voice/audio";
import {
  embedUtterance,
  embeddingToArray,
  meanEmbedding,
} from "@/lib/voice/embed";
import { HARVARD_ENROLLMENT } from "@/lib/voice/harvard";
import {
  PART_MIN_VOICED,
  MIN_CONSISTENCY,
  consistencyScore,
  evaluatePart,
} from "@/lib/voice/quality";
import { saveVoiceprint } from "@/lib/voice/repository";
import { deleteVoiceSample } from "@/lib/auth/voice-sample";
import { logActivity } from "@/lib/db/repository";
import { nowIso } from "@/lib/utils";
import type {
  EnrollmentPartId,
  EnrollmentPartQuality,
  VoiceprintMeta,
} from "@/lib/voice/types";

export type EnrollmentPartInput = {
  part: EnrollmentPartId;
  bytes: Buffer;
  /** Client SpeechRecognition transcript for the read part. */
  heardText?: string;
};

export type EnrollmentResult =
  | {
      ok: true;
      meta: VoiceprintMeta;
    }
  | {
      ok: false;
      parts: EnrollmentPartQuality[];
      consistency: number | null;
      error: string;
    };

/**
 * Process three enrollment parts: quality checks, embed, mean voiceprint.
 * Raw audio is never kept after a successful enroll (clearSamplePath).
 */
export async function enrollVoiceprint(opts: {
  personId: string;
  parts: EnrollmentPartInput[];
  /** Existing sample path to delete after success. */
  previousSamplePath?: string | null;
}): Promise<EnrollmentResult> {
  const byId = new Map(opts.parts.map((p) => [p.part, p]));
  const order: EnrollmentPartId[] = ["read", "natural", "competition"];
  const qualities: EnrollmentPartQuality[] = [];
  const embeddings: Float32Array[] = [];
  let backend: VoiceprintMeta["model"] = "spectral-fallback";

  for (const id of order) {
    const part = byId.get(id);
    if (!part) {
      qualities.push({
        part: id,
        ok: false,
        voiced_seconds: 0,
        level_ok: false,
        clipping: false,
        noisy: false,
        redo_reason: "Missing this part. Record it again.",
      });
      continue;
    }
    const pcm = await decodeToPcm16k(part.bytes);
    if (!pcm) {
      qualities.push({
        part: id,
        ok: false,
        voiced_seconds: 0,
        level_ok: false,
        clipping: false,
        noisy: false,
        redo_reason: "Could not read that audio. Record again as WAV if you can.",
      });
      continue;
    }
    const q = evaluatePart({
      part: id,
      pcm,
      minVoiced: PART_MIN_VOICED[id],
      heardText: part.heardText,
      readText: id === "read" ? HARVARD_ENROLLMENT.text : undefined,
    });
    qualities.push(q);
    if (!q.ok) continue;
    const { embedding, backend: b } = await embedUtterance(pcm);
    backend = b;
    embeddings.push(embedding);
  }

  if (qualities.some((q) => !q.ok) || embeddings.length < 3) {
    return {
      ok: false,
      parts: qualities,
      consistency: null,
      error: qualities.find((q) => q.redo_reason)?.redo_reason ?? "Redo the failed parts.",
    };
  }

  const consistency = consistencyScore(embeddings);
  if (consistency < MIN_CONSISTENCY) {
    return {
      ok: false,
      parts: qualities.map((q) => ({
        ...q,
        ok: false,
        redo_reason:
          q.redo_reason ??
          "The three parts do not sound like the same person. Redo all three in one sitting.",
      })),
      consistency,
      error: "The three parts do not match each other closely enough. Redo all three.",
    };
  }

  const mean = meanEmbedding(embeddings);
  const meta: VoiceprintMeta = {
    parts: qualities,
    consistency: Number(consistency.toFixed(3)),
    model: backend,
    enrolled_at: nowIso(),
  };

  await saveVoiceprint({
    personId: opts.personId,
    embedding: embeddingToArray(mean),
    meta,
    clearSamplePath: true,
  });

  if (opts.previousSamplePath) {
    await deleteVoiceSample(opts.previousSamplePath, opts.personId);
  }

  await logActivity({
    person_id: opts.personId,
    action: "voiceprint_enrolled",
    target: opts.personId,
    meta: {
      consistency: meta.consistency,
      model: meta.model,
      parts: qualities.map((q) => ({
        part: q.part,
        voiced: q.voiced_seconds,
      })),
    },
  });

  return { ok: true, meta };
}

/** Blend a confirmed practice clip into the stored voiceprint (small step). */
export async function refineVoiceprintFromClip(opts: {
  personId: string;
  clipPcm: import("@/lib/voice/audio").Pcm16k;
}): Promise<void> {
  const { getVoiceprint } = await import("@/lib/voice/repository");
  const existing = await getVoiceprint(opts.personId);
  if (!existing) return;
  const { embedding } = await embedUtterance(opts.clipPcm);
  const prev = Float32Array.from(existing.embedding);
  // 85% old + 15% new, then re-normalise via meanEmbedding.
  const blended = meanEmbedding([prev, prev, prev, prev, prev, embedding]);
  const meta: VoiceprintMeta = {
    ...(existing.meta ?? {
      parts: [],
      consistency: 1,
      model: "spectral-fallback",
      enrolled_at: nowIso(),
    }),
    enrolled_at: existing.meta?.enrolled_at ?? nowIso(),
  };
  meta.model = (await embedUtterance(opts.clipPcm)).backend;
  await saveVoiceprint({
    personId: opts.personId,
    embedding: embeddingToArray(blended),
    meta,
  });
  await logActivity({
    person_id: opts.personId,
    action: "voiceprint_refined",
    target: opts.personId,
  });
}
