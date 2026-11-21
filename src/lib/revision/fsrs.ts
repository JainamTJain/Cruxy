/**
 * Minimal FSRS-4.5 scheduler (no external deps).
 * Ratings: 1=Again, 2=Hard, 3=Good, 4=Easy
 * States: 0=New, 1=Learning, 2=Review, 3=Relearning
 */

export type FsrsRating = 1 | 2 | 3 | 4;
export type FsrsState = 0 | 1 | 2 | 3;

export interface FsrsCard {
  due: Date;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: FsrsState;
  last_review: Date | null;
}

const W = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234, 1.616,
  0.1544, 1.0824, 1.9813, 0.0953, 0.2975, 2.2042, 0.2407, 2.9466, 0.5034,
  0.6567,
] as const;

const REQUEST_RETENTION = 0.9;
const MAX_INTERVAL = 365;

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function initDifficulty(rating: FsrsRating): number {
  return clamp(W[4] - Math.exp(W[5] * (rating - 1)) + 1, 1, 10);
}

function nextDifficulty(d: number, rating: FsrsRating): number {
  const next = d - W[6] * (rating - 3);
  return clamp(W[7] * initDifficulty(3) + (1 - W[7]) * next, 1, 10);
}

function initStability(rating: FsrsRating): number {
  return Math.max(W[rating - 1], 0.1);
}

function nextStability(
  d: number,
  s: number,
  r: number,
  rating: FsrsRating,
): number {
  if (rating === 1) {
    return clamp(
      W[11] *
        Math.pow(d, -W[12]) *
        (Math.pow(s + 1, W[13]) - 1) *
        Math.exp(W[14] * (1 - r)),
      0.1,
      36500,
    );
  }
  const hardPenalty = rating === 2 ? W[15] : 1;
  const easyBonus = rating === 4 ? W[16] : 1;
  return clamp(
    s *
      (Math.exp(W[8]) *
        (11 - d) *
        Math.pow(s, -W[9]) *
        (Math.exp(W[10] * (1 - r)) - 1) *
        hardPenalty *
        easyBonus +
        1),
    0.1,
    36500,
  );
}

function retrievability(elapsed: number, stability: number): number {
  return Math.pow(1 + (elapsed / (9 * stability)), -1);
}

function nextInterval(stability: number): number {
  const interval =
    (stability / 9) * (Math.pow(REQUEST_RETENTION, -1) - 1) * 9;
  return clamp(Math.round(interval), 1, MAX_INTERVAL);
}

export function createEmptyCard(now = new Date()): FsrsCard {
  return {
    due: now,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    last_review: null,
  };
}

export function reviewCard(
  card: FsrsCard,
  rating: FsrsRating,
  now = new Date(),
): FsrsCard {
  const last = card.last_review ?? now;
  const elapsed = Math.max(
    0,
    Math.floor((now.getTime() - last.getTime()) / 86_400_000),
  );

  let { stability, difficulty, state, reps, lapses, scheduled_days } = card;

  if (state === 0) {
    difficulty = initDifficulty(rating);
    stability = initStability(rating);
    state = rating === 1 ? 1 : 2;
    if (rating === 1) lapses += 1;
  } else {
    const r = retrievability(elapsed || 0.001, Math.max(stability, 0.1));
    difficulty = nextDifficulty(difficulty || initDifficulty(3), rating);
    stability = nextStability(
      difficulty,
      Math.max(stability, 0.1),
      r,
      rating,
    );
    if (rating === 1) {
      lapses += 1;
      state = 3;
    } else {
      state = 2;
    }
  }

  reps += 1;
  let intervalDays: number;
  if (state === 1 || state === 3) {
    intervalDays = rating === 1 ? 0 : rating === 2 ? 1 : 1;
  } else {
    intervalDays = nextInterval(stability);
    if (rating === 4) intervalDays = Math.min(MAX_INTERVAL, intervalDays + 1);
  }
  scheduled_days = intervalDays;

  const due = new Date(now.getTime() + intervalDays * 86_400_000);
  if (intervalDays === 0) {
    due.setTime(now.getTime() + 10 * 60_000);
  }

  return {
    due,
    stability,
    difficulty,
    elapsed_days: elapsed,
    scheduled_days,
    reps,
    lapses,
    state,
    last_review: now,
  };
}

/** Grade spoken/typed answer quality into FSRS rating. */
export function answerQualityToRating(
  correct: boolean,
  hesitation?: "easy" | "ok" | "hard",
): FsrsRating {
  if (!correct) return 1;
  if (hesitation === "hard") return 2;
  if (hesitation === "easy") return 4;
  return 3;
}
