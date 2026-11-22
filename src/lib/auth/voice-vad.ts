/**
 * Browser-side RMS / voice-activity helpers for consent enrollment.
 * No server imports; safe in client components.
 */

export type QualityFlag = "ok" | "quiet" | "clipping" | "background";

export type FrameAnalysis = {
  rms: number;
  peak: number;
  voiced: boolean;
  quality: QualityFlag;
};

/** Normalize AnalyserNode byte/time data into RMS and peak in 0..1. */
export function analyseTimeDomain(
  samples: Float32Array,
  opts?: {
    voiceThreshold?: number;
    quietPeak?: number;
    clipPeak?: number;
    noiseFloor?: number;
  },
): FrameAnalysis {
  const voiceThreshold = opts?.voiceThreshold ?? 0.02;
  const quietPeak = opts?.quietPeak ?? 0.012;
  const clipPeak = opts?.clipPeak ?? 0.97;
  const noiseFloor = opts?.noiseFloor ?? 0;

  let sumSq = 0;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] ?? 0;
    const a = Math.abs(v);
    if (a > peak) peak = a;
    sumSq += v * v;
  }
  const rms = samples.length ? Math.sqrt(sumSq / samples.length) : 0;

  if (peak >= clipPeak) {
    return { rms, peak, voiced: false, quality: "clipping" };
  }
  // Sustained mid energy with a high floor usually means room noise.
  if (noiseFloor > 0.035 && rms < voiceThreshold * 1.8 && rms > 0.02) {
    return { rms, peak, voiced: false, quality: "background" };
  }
  if (rms < quietPeak && peak < quietPeak * 1.4) {
    return { rms, peak, voiced: false, quality: "quiet" };
  }
  const voiced = rms >= voiceThreshold && peak < clipPeak;
  return { rms, peak, voiced, quality: "ok" };
}

export function pickRecorderMime(): { mimeType?: string; ext: string } {
  if (typeof MediaRecorder === "undefined") {
    return { ext: "webm" };
  }
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return { mimeType: "audio/webm;codecs=opus", ext: "webm" };
  }
  if (MediaRecorder.isTypeSupported("audio/webm")) {
    return { mimeType: "audio/webm", ext: "webm" };
  }
  if (MediaRecorder.isTypeSupported("audio/mp4")) {
    return { mimeType: "audio/mp4", ext: "mp4" };
  }
  return { ext: "webm" };
}

export function releaseStream(stream: MediaStream | null | undefined): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  }
}

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onend: (() => void) | null;
};

export type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

export function getSpeechRecognitionCtor(): (new () => SpeechRec) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
