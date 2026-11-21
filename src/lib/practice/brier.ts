/**
 * Brier scores for required score predictions (Wave 6).
 * Predictions are point scores 1 to 10; we map them onto APPE score bands
 * as probability distributions, then score against the actual band.
 */
import type { AppeItemKey } from "@/lib/practice/types";

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

export function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 5;
  return Math.min(10, Math.max(1, Math.round(n)));
}

export function bandIndexForScore(score: number): number {
  const s = clampScore(score);
  const i = SCORE_BANDS.findIndex((b) => s >= b.min && s <= b.max);
  return i >= 0 ? i : 2;
}

/**
 * Soft distribution peaked on the predicted band, with mass on neighbours.
 * Sums to 1 across SCORE_BANDS.
 */
export function predictionToBandProbs(predicted: number): number[] {
  const peak = bandIndexForScore(predicted);
  const raw: number[] = SCORE_BANDS.map((_, i) => {
    const d = Math.abs(i - peak);
    if (d === 0) return 0.6;
    if (d === 1) return 0.2;
    if (d === 2) return 0.05;
    return 0;
  });
  // Edges lose neighbour mass; renormalise.
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map((x) => x / sum);
}

/** One-hot outcome over bands for the actual score. */
export function actualToBandOutcome(actual: number): number[] {
  const hit = bandIndexForScore(actual);
  return SCORE_BANDS.map((_, i) => (i === hit ? 1 : 0));
}

/** Multiclass Brier: sum_i (f_i - o_i)^2. Lower is better; 0 is perfect. */
export function brierForItem(predicted: number, actual: number): number {
  const f = predictionToBandProbs(predicted);
  const o = actualToBandOutcome(actual);
  let sum = 0;
  for (let i = 0; i < f.length; i++) {
    const d = (f[i] ?? 0) - (o[i] ?? 0);
    sum += d * d;
  }
  return sum;
}

export function meanBrier(
  pairs: { predicted: number; actual: number; item: AppeItemKey }[],
): {
  brier: number;
  item_briers: Partial<Record<AppeItemKey, number>>;
  predicted_mean: number | null;
  actual_mean: number | null;
} {
  if (!pairs.length) {
    return {
      brier: 0,
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
    const b = brierForItem(p.predicted, p.actual);
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
