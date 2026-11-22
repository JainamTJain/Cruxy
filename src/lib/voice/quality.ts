import type { Pcm16k } from "@/lib/voice/audio";
import { cosineSimilarity } from "@/lib/voice/embed";
import { harvardWordCount } from "@/lib/voice/harvard";
import { wordsOf } from "@/lib/auth/voice-passages";
import type {
  EnrollmentPartId,
  EnrollmentPartQuality,
} from "@/lib/voice/types";

const VOICED_THRESH = 0.02;
const CLIP_THRESH = 0.98;
const QUIET_RMS = 0.01;
const NOISE_FLOOR_RATIO = 0.45;

export type FrameStats = {
  voicedSeconds: number;
  rms: number;
  peak: number;
  clippingFraction: number;
  noiseFloor: number;
};

export function analysePcm(pcm: Pcm16k): FrameStats {
  const frame = 320; // 20ms at 16k
  let voiced = 0;
  let sumSq = 0;
  let peak = 0;
  let clipFrames = 0;
  let frames = 0;
  const noiseSamples: number[] = [];

  for (let i = 0; i + frame <= pcm.samples.length; i += frame) {
    frames += 1;
    let e = 0;
    let p = 0;
    let clips = 0;
    for (let j = 0; j < frame; j++) {
      const s = Math.abs(pcm.samples[i + j]!);
      e += s * s;
      if (s > p) p = s;
      if (s >= CLIP_THRESH) clips += 1;
    }
    const rms = Math.sqrt(e / frame);
    sumSq += e;
    if (p > peak) peak = p;
    if (clips > frame * 0.02) clipFrames += 1;
    if (rms >= VOICED_THRESH) voiced += frame / 16000;
    else noiseSamples.push(rms);
  }

  noiseSamples.sort((a, b) => a - b);
  const noiseFloor =
    noiseSamples[Math.floor(noiseSamples.length * 0.2)] ?? 0.005;

  return {
    voicedSeconds: voiced,
    rms: frames ? Math.sqrt(sumSq / (frames * frame)) : 0,
    peak,
    clippingFraction: frames ? clipFrames / frames : 0,
    noiseFloor,
  };
}

export function wordMatchScore(expectedText: string, heardText: string): number {
  const expected = wordsOf(expectedText);
  const heard = new Set(wordsOf(heardText));
  if (expected.length === 0) return 1;
  let hit = 0;
  for (const w of expected) if (heard.has(w)) hit += 1;
  return hit / expected.length;
}

export function evaluatePart(opts: {
  part: EnrollmentPartId;
  pcm: Pcm16k;
  minVoiced: number;
  heardText?: string;
  readText?: string;
}): EnrollmentPartQuality {
  const stats = analysePcm(opts.pcm);
  const level_ok = stats.rms >= QUIET_RMS;
  const clipping = stats.clippingFraction > 0.05;
  const noisy =
    stats.noiseFloor > QUIET_RMS &&
    stats.rms > 0 &&
    stats.noiseFloor / stats.rms > NOISE_FLOOR_RATIO;

  let word_match: number | undefined;
  let redo_reason: string | null = null;

  if (stats.voicedSeconds < opts.minVoiced) {
    redo_reason = `Need about ${opts.minVoiced} seconds of clear speech (heard ${stats.voicedSeconds.toFixed(1)}s).`;
  } else if (!level_ok) {
    redo_reason = "Too quiet. Move closer to the mic.";
  } else if (clipping) {
    redo_reason = "Too loud or clipping. Move back a little.";
  } else if (noisy) {
    redo_reason = "Background noise is high. Find a quieter spot.";
  }

  if (opts.part === "read" && opts.readText) {
    word_match = wordMatchScore(opts.readText, opts.heardText ?? "");
    const minMatch = Math.min(0.55, 0.4 + harvardWordCount() / 500);
    if (!redo_reason && word_match < minMatch) {
      redo_reason =
        "The read did not match the passage closely enough. Read it again from the start.";
    }
  }

  return {
    part: opts.part,
    ok: redo_reason === null,
    voiced_seconds: Number(stats.voicedSeconds.toFixed(2)),
    level_ok,
    clipping,
    noisy,
    word_match,
    redo_reason,
  };
}

/** Mean pairwise cosine across part embeddings; low = redo all. */
export function consistencyScore(embeddings: Float32Array[]): number {
  if (embeddings.length < 2) return 1;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      sum += cosineSimilarity(embeddings[i]!, embeddings[j]!);
      n += 1;
    }
  }
  return n ? sum / n : 0;
}

export const PART_MIN_VOICED: Record<EnrollmentPartId, number> = {
  read: 10,
  natural: 18,
  competition: 12,
};

/** Soft floor for accepting an enrollment after all parts pass. */
export const MIN_CONSISTENCY = 0.35;
