/**
 * Speaker embeddings for voiceprints.
 *
 * IMPORTANT (for Jainam): this path uses onnxruntime-node with an Apache-2.0
 * ECAPA-TDNN ONNX model. It is NOT a language model and does NOT go through
 * callCruxy() / the Vercel AI Gateway. Only text/LLM calls use the gateway.
 *
 * Model: SpeechBrain ECAPA-TDNN (192-dim), ONNX from kenrunio/transcriber-speaker-onnx
 * (Apache-2.0). Download with `node scripts/download-voiceprint-model.mjs`.
 * When the model file is missing, a deterministic spectral fallback is used so
 * sample mode and CI still exercise matching (synthetic tones).
 */
import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { VOICEPRINT_DIM } from "@/lib/voice/types";
import type { Pcm16k } from "@/lib/voice/audio";

export type EmbedBackend = "ecapa-onnx" | "spectral-fallback";

const DEFAULT_MODEL = path.join(
  process.cwd(),
  ".data",
  "models",
  "ecapa-any-length.onnx",
);

let sessionPromise: Promise<import("onnxruntime-node").InferenceSession | null> | null =
  null;

function modelPath(): string {
  return process.env.VOICEPRINT_MODEL_PATH?.trim() || DEFAULT_MODEL;
}

async function loadSession(): Promise<
  import("onnxruntime-node").InferenceSession | null
> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      try {
        await fs.access(modelPath());
      } catch {
        return null;
      }
      try {
        const ort = await import("onnxruntime-node");
        return await ort.InferenceSession.create(modelPath(), {
          executionProviders: ["cpu"],
        });
      } catch {
        return null;
      }
    })();
  }
  return sessionPromise;
}

export function l2Normalize(v: Float32Array | number[]): Float32Array {
  const out = v instanceof Float32Array ? v : Float32Array.from(v);
  let sum = 0;
  for (let i = 0; i < out.length; i++) sum += out[i]! * out[i]!;
  const n = Math.sqrt(sum) || 1;
  for (let i = 0; i < out.length; i++) out[i]! /= n;
  return out;
}

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d > 0 ? dot / d : 0;
}

/**
 * Deterministic 192-dim spectral fingerprint for CI / missing model.
 * Uses Goertzel band energies + F0 hint so synthetic tones and rough
 * voice bands separate without the ONNX weights.
 */
export function spectralEmbed(pcm: Pcm16k): Float32Array {
  const samples = pcm.samples;
  const out = new Float32Array(VOICEPRINT_DIM);
  if (samples.length === 0) return out;

  const sr = pcm.sampleRate;
  // 180 log-spaced band centres from ~80 Hz to ~4 kHz.
  for (let b = 0; b < 180; b++) {
    const freq = 80 * Math.pow(4000 / 80, b / 179);
    const w = (2 * Math.PI * freq) / sr;
    const coeff = 2 * Math.cos(w);
    let s0 = 0;
    let s1 = 0;
    let s2 = 0;
    // Decimate for speed on long clips.
    const step = samples.length > 48000 ? 2 : 1;
    for (let i = 0; i < samples.length; i += step) {
      s0 = samples[i]! + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
    out[b] = Math.log1p(Math.max(0, power));
  }

  // Zero-crossing rate → coarse F0 proxy in the last dims.
  let zc = 0;
  let prev = samples[0] ?? 0;
  for (let i = 1; i < samples.length; i++) {
    const s = samples[i]!;
    if ((s >= 0 && prev < 0) || (s < 0 && prev >= 0)) zc += 1;
    prev = s;
  }
  const zcr = zc / Math.max(1, samples.length);
  out[180] = zcr * 50;
  out[181] = zcr * zcr * 100;
  // Peak autocorrelation lag (rough pitch period in samples).
  const maxLag = Math.min(400, Math.floor(samples.length / 4));
  let bestLag = 0;
  let bestCorr = -1;
  for (let lag = 40; lag < maxLag; lag += 2) {
    let corr = 0;
    const n = Math.min(2000, samples.length - lag);
    for (let i = 0; i < n; i++) corr += samples[i]! * samples[i + lag]!;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  out[182] = bestLag / 400;
  out[183] = bestCorr > 0 ? Math.log1p(bestCorr) / 20 : 0;
  let mean = 0;
  for (let i = 0; i < samples.length; i++) mean += samples[i]!;
  mean /= samples.length;
  let varSum = 0;
  for (let i = 0; i < samples.length; i++) {
    const d = samples[i]! - mean;
    varSum += d * d;
  }
  out[184] = mean;
  out[185] = Math.sqrt(varSum / samples.length);
  return l2Normalize(out);
}

async function ecapaEmbed(pcm: Pcm16k): Promise<Float32Array | null> {
  const session = await loadSession();
  if (!session) return null;
  try {
    const ort = await import("onnxruntime-node");
    const wav = new ort.Tensor("float32", pcm.samples, [1, pcm.samples.length]);
    const lens = new ort.Tensor("float32", Float32Array.from([1]), [1]);
    const result = await session.run({ wav, lens });
    const key = Object.keys(result)[0];
    if (!key) return null;
    const tensor = result[key]!;
    const data = tensor.data as Float32Array;
    // Shape (1, 1, 192) or (1, 192)
    const emb = new Float32Array(VOICEPRINT_DIM);
    const offset = data.length >= VOICEPRINT_DIM ? data.length - VOICEPRINT_DIM : 0;
    for (let i = 0; i < VOICEPRINT_DIM; i++) {
      emb[i] = data[offset + i] ?? 0;
    }
    return l2Normalize(emb);
  } catch {
    return null;
  }
}

export async function embedUtterance(
  pcm: Pcm16k,
): Promise<{ embedding: Float32Array; backend: EmbedBackend }> {
  if (pcm.samples.length < 1600) {
    // <100ms: pad with silence so the model still runs.
    const padded = new Float32Array(16000);
    padded.set(pcm.samples);
    pcm = { samples: padded, sampleRate: 16000 };
  }
  const onnx = await ecapaEmbed(pcm);
  if (onnx) return { embedding: onnx, backend: "ecapa-onnx" };
  return { embedding: spectralEmbed(pcm), backend: "spectral-fallback" };
}

/** Mean of unit vectors, re-normalised. */
export function meanEmbedding(vectors: Float32Array[]): Float32Array {
  const out = new Float32Array(VOICEPRINT_DIM);
  if (vectors.length === 0) return out;
  for (const v of vectors) {
    for (let i = 0; i < VOICEPRINT_DIM; i++) out[i]! += v[i] ?? 0;
  }
  for (let i = 0; i < VOICEPRINT_DIM; i++) out[i]! /= vectors.length;
  return l2Normalize(out);
}

export function embeddingToArray(v: Float32Array): number[] {
  return Array.from(v);
}

export function arrayToEmbedding(a: number[] | null | undefined): Float32Array | null {
  if (!a || a.length < VOICEPRINT_DIM) return null;
  return l2Normalize(Float32Array.from(a.slice(0, VOICEPRINT_DIM)));
}
