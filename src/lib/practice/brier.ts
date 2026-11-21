/**
 * Brier scores for required score predictions (Wave 6).
 * Point scores 1 to 10 plus stated confidence map onto APPE score bands
 * as probability distributions, then score against the actual band.
 */
import type {
  AppeItemKey,
  ItemPrediction,
  ItemPredictionInput,
  PredictionConfidence,
} from "@/lib/practice/types";

/** APPE Guide bands used for probability forecasts. */
export const SCORE_BANDS = [
  { id: "1-2", min: 1, max: 2, label: "1 to 2 almost absent" },
  { id: "3-4", min: 3, max: 4, label: "3 to 4 seriously flawed" },
  { id: "5", min: 5, max: 5, label: "5 more serious weaknesses" },
  { id: "6", min: 6, max: 6, label: "6 noticeable weaknesses" },
  { id: "7", min: 7, max: 7, label: "7 solid" },
  { id: "8", min: 8, max: 8, label: "8 excellent" },
  { id: "9-10", min: 9, max: 10, label: "9 to 10 outstanding" },
] as const;

export type ScoreBandId = (typeof SCORE_BANDS)[number]["id"];

export const CONFIDENCE_OPTIONS: PredictionConfidence[] = [30, 50, 70, 90];

export function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 5;
  return Math.min(10, Math.max(1, Math.round(n)));
}

export function clampConfidence(n: number): PredictionConfidence {
  if (n <= 40) return 30;
  if (n <= 60) return 50;
  if (n <= 80) return 70;
  return 90;
}

export function bandIndexForScore(score: number): number {
  const s = clampScore(score);
  const i = SCORE_BANDS.findIndex((b) => s >= b.min && s <= b.max);
  return i >= 0 ? i : 2;
}

/**
 * Normalize stored item_scores values.
 * Plain number (legacy) → confidence 50.
 */
export function normalizeItemPrediction(
  raw: ItemPredictionInput | null | undefined,
): ItemPrediction | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 1 || raw > 10) return null;
    return { score: clampScore(raw), confidence: 50 };
  }
  if (typeof raw !== "object") return null;
  const score = Number((raw as ItemPrediction).score);
  if (!Number.isFinite(score) || score < 1 || score > 10) return null;
  const confRaw = Number((raw as ItemPrediction).confidence);
  const confidence = Number.isFinite(confRaw)
    ? clampConfidence(confRaw)
    : 50;
  return { score: clampScore(score), confidence };
}

/**
 * Stated confidence sits on the predicted band; the rest spreads over neighbours.
 * Sums to 1 across SCORE_BANDS.
 */
export function predictionToBandProbs(
  predicted: number,
  confidencePct: number = 50,
): number[] {
  const peak = bandIndexForScore(predicted);
  const conf = Math.min(0.99, Math.max(0.01, confidencePct / 100));
  const remainder = 1 - conf;
  const neighborWeights: number[] = SCORE_BANDS.map((_, i) => {
    const d = Math.abs(i - peak);
    if (d === 0) return 0;
    if (d === 1) return 2;
    if (d === 2) return 0.5;
    return 0;
  });
  const wSum = neighborWeights.reduce((a, b) => a + b, 0);
  return SCORE_BANDS.map((_, i) => {
    if (i === peak) return conf;
    if (wSum <= 0) return 0;
    return remainder * ((neighborWeights[i] ?? 0) / wSum);
  });
}

/** One-hot outcome over bands for the actual score. */
export function actualToBandOutcome(actual: number): number[] {
  const hit = bandIndexForScore(actual);
  return SCORE_BANDS.map((_, i) => (i === hit ? 1 : 0));
}

/** True when predicted and actual fall in the same APPE band. */
export function bandHit(predicted: number, actual: number): boolean {
  return bandIndexForScore(predicted) === bandIndexForScore(actual);
}

/** Multiclass Brier: sum_i (f_i - o_i)^2. Lower is better; 0 is perfect. */
export function brierForItem(
  predicted: number,
  actual: number,
  confidencePct: number = 50,
): number {
  const f = predictionToBandProbs(predicted, confidencePct);
  const o = actualToBandOutcome(actual);
  let sum = 0;
  for (let i = 0; i < f.length; i++) {
    const d = (f[i] ?? 0) - (o[i] ?? 0);
    sum += d * d;
  }
  return sum;
}

export type MeanBrierResult = {
  brier: number | null;
  item_briers: Partial<Record<AppeItemKey, number>>;
  predicted_mean: number | null;
  actual_mean: number | null;
};

export function meanBrier(
  pairs: {
    predicted: number;
    actual: number;
    confidence?: number;
    item: AppeItemKey;
  }[],
): MeanBrierResult {
  if (!pairs.length) {
    return {
      brier: null,
      item_briers: {},
      predicted_mean: null,
      actual_mean: null,
    };
  }
  const item_briers: Partial<Record<AppeItemKey, number>> = {};
  let total = 0;
  let predSum = 0;
  let actSum = 0;
  for (const p of pairs) {
    const b = brierForItem(p.predicted, p.actual, p.confidence ?? 50);
    item_briers[p.item] = b;
    total += b;
    predSum += p.predicted;
    actSum += p.actual;
  }
  return {
    brier: total / pairs.length,
    item_briers,
    predicted_mean: predSum / pairs.length,
    actual_mean: actSum / pairs.length,
  };
}

/** Reliability buckets: stated confidence vs how often the band actually hit. */
export function calibrationBuckets(
  samples: { confidence: number; hit: boolean }[],
): {
  confidence: PredictionConfidence;
  n: number;
  hitRate: number | null;
}[] {
  return CONFIDENCE_OPTIONS.map((confidence) => {
    const rows = samples.filter(
      (s) => clampConfidence(s.confidence) === confidence,
    );
    if (!rows.length) {
      return { confidence, n: 0, hitRate: null };
    }
    const hits = rows.filter((r) => r.hit).length;
    return { confidence, n: rows.length, hitRate: hits / rows.length };
  });
}
