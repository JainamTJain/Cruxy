import "server-only";
import {
  decodeToPcm16k,
  encodeWav,
  slicePcmMs,
  type Pcm16k,
} from "@/lib/voice/audio";
import {
  arrayToEmbedding,
  embedUtterance,
  embeddingToArray,
  meanEmbedding,
} from "@/lib/voice/embed";
import {
  assignSpeakersOneToOne,
  AUTO_MATCH_THRESHOLD,
  CANDIDATE_THRESHOLD,
  mergeNameSignal,
  needsWhoIsThis,
} from "@/lib/voice/match";
import {
  listVoiceprintsForPeople,
  upsertSpeakerMatchPending,
} from "@/lib/voice/repository";
import type { TranscriptUtterance } from "@/lib/practice/transcription";
import type { MatchResult, SpeakerMapping } from "@/lib/voice/types";
import { uploadBytes } from "@/lib/ops/storage";
import { cosineSimilarity } from "@/lib/voice/embed";

const MIN_SEGMENT_MS = 800;
const CLIP_MS = 5000;

async function embedLabelFromUtterances(
  pcm: Pcm16k,
  utterances: TranscriptUtterance[],
  label: string,
): Promise<Float32Array | null> {
  const segs = utterances.filter(
    (u) => u.speaker === label && u.end_ms - u.start_ms >= MIN_SEGMENT_MS,
  );
  if (segs.length === 0) return null;
  // Prefer longest clean segments (up to 3).
  const top = [...segs]
    .sort((a, b) => b.end_ms - b.start_ms - (a.end_ms - a.start_ms))
    .slice(0, 3);
  const embeds: Float32Array[] = [];
  for (const s of top) {
    const slice = slicePcmMs(pcm, s.start_ms, s.end_ms);
    const { embedding } = await embedUtterance(slice);
    embeds.push(embedding);
  }
  return embeds.length ? meanEmbedding(embeds) : null;
}

function pickClipRange(
  utterances: TranscriptUtterance[],
  label: string,
): { startMs: number; endMs: number } | null {
  const segs = utterances
    .filter((u) => u.speaker === label)
    .sort((a, b) => b.end_ms - b.start_ms - (a.end_ms - a.start_ms));
  const best = segs[0];
  if (!best) return null;
  const mid = (best.start_ms + best.end_ms) / 2;
  const startMs = Math.max(0, mid - CLIP_MS / 2);
  return { startMs, endMs: startMs + CLIP_MS };
}

/**
 * Match diarized speakers to enrolled voiceprints (one-to-one), merge with
 * AssemblyAI name identification, and queue Who-is-this for low confidence.
 * Must run before practice audio is deleted.
 */
export async function matchSpeakersByVoiceprint(opts: {
  roundId: string;
  audio: Buffer;
  utterances: TranscriptUtterance[];
  presentPersonIds: string[];
  nameByLabel?: Record<string, string | null>;
}): Promise<MatchResult> {
  const labels = [...new Set(opts.utterances.map((u) => u.speaker))];
  const enrolled = await listVoiceprintsForPeople(opts.presentPersonIds);
  const peopleById = new Map(enrolled.map((e) => [e.personId, e.name]));

  // Fallback: no voiceprints → empty voice scores; name/role fill later.
  const pcm = await decodeToPcm16k(opts.audio);
  const labelEmbeds: { label: string; embedding: Float32Array }[] = [];

  if (pcm && enrolled.length > 0) {
    for (const label of labels) {
      const emb = await embedLabelFromUtterances(pcm, opts.utterances, label);
      if (emb) labelEmbeds.push({ label, embedding: emb });
    }
  }

  const people = enrolled
    .map((e) => {
      const emb = arrayToEmbedding(e.embedding);
      return emb
        ? { personId: e.personId, name: e.name, embedding: emb }
        : null;
    })
    .filter(Boolean) as {
    personId: string;
    name: string;
    embedding: Float32Array;
  }[];

  const voiceAssign = assignSpeakersOneToOne(labelEmbeds, people);
  // Labels with no embed still appear.
  for (const label of labels) {
    if (!voiceAssign.some((v) => v.label === label)) {
      voiceAssign.push({ label, personId: null, score: 0 });
    }
  }

  const mappings = mergeNameSignal(
    voiceAssign,
    opts.nameByLabel ?? {},
    peopleById,
  );

  const pending: MatchResult["pending"] = [];

  for (const m of mappings) {
    if (!needsWhoIsThis(m)) continue;
    if (!pcm) continue;

    const range = pickClipRange(opts.utterances, m.speaker_label);
    let clip_path: string | null = null;
    let embedding: number[] | null = null;
    if (range) {
      const slice = slicePcmMs(pcm, range.startMs, range.endMs);
      const wav = encodeWav(slice.samples, 16000);
      clip_path = `who-is-this/${opts.roundId}/${m.speaker_label}.wav`;
      await uploadBytes({
        bucket: "audio-chunks",
        path: clip_path,
        bytes: wav,
        contentType: "audio/wav",
      });
      const { embedding: emb } = await embedUtterance(slice);
      embedding = embeddingToArray(emb);
    }

    const candidates = people
      .map((p) => ({
        person_id: p.personId,
        name: p.name,
        score: embedding
          ? cosineSimilarity(embedding, p.embedding)
          : 0,
      }))
      .filter((c) => c.score >= CANDIDATE_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    pending.push({
      round_id: opts.roundId,
      speaker_label: m.speaker_label,
      clip_path,
      candidates,
      embedding,
    });
  }

  for (const p of pending) {
    await upsertSpeakerMatchPending(p);
  }

  // Auto-clear person_id when pending (force confirm) except keep suggestion in candidates.
  const finalMappings: SpeakerMapping[] = mappings.map((m) => {
    if (needsWhoIsThis(m) && pending.some((p) => p.speaker_label === m.speaker_label)) {
      return {
        ...m,
        // Keep best guess but flag low confidence for UI.
        confidence: Math.min(m.confidence ?? 0, AUTO_MATCH_THRESHOLD - 0.01),
      };
    }
    return m;
  });

  return { mappings: finalMappings, pending };
}

/**
 * Role-order fallback when no voiceprints and no name map.
 */
export function roleOrderMappings(
  utterances: TranscriptUtterance[],
  presentPersonIds: string[],
): SpeakerMapping[] {
  const labels = [...new Set(utterances.map((u) => u.speaker))];
  return labels.map((label, i) => ({
    speaker_label: label,
    person_id: presentPersonIds[i] ?? null,
    confidence: presentPersonIds[i] ? 0.4 : 0,
    source: "role" as const,
  }));
}
