/**
 * FSRS scheduling via ts-fsrs (see docs/research/apis.md).
 * Ratings: 1=Again, 2=Hard, 3=Good, 4=Easy
 * States: 0=New, 1=Learning, 2=Review, 3=Relearning
 */
import {
  createEmptyCard as tsCreateEmptyCard,
  fsrs,
  Rating,
  State,
  type Card as TsCard,
  type Grade,
} from "ts-fsrs";

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

const scheduler = fsrs();

const RATING_MAP: Record<FsrsRating, Grade> = {
  1: Rating.Again,
  2: Rating.Hard,
  3: Rating.Good,
  4: Rating.Easy,
};

function toTsCard(card: FsrsCard): TsCard {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    learning_steps: 0,
    state: card.state as State,
    last_review: card.last_review ?? undefined,
  };
}

function fromTsCard(card: TsCard): FsrsCard {
  return {
    due: card.due instanceof Date ? card.due : new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as FsrsState,
    last_review: card.last_review
      ? card.last_review instanceof Date
        ? card.last_review
        : new Date(card.last_review)
      : null,
  };
}

export function createEmptyCard(now = new Date()): FsrsCard {
  return fromTsCard(tsCreateEmptyCard(now));
}

export function reviewCard(
  card: FsrsCard,
  rating: FsrsRating,
  now = new Date(),
): FsrsCard {
  const next = scheduler.next(toTsCard(card), now, RATING_MAP[rating]);
  return fromTsCard(next.card);
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

/** Interval preview labels for the flashcard grade buttons. */
export function previewIntervals(
  card: FsrsCard | null,
  now = new Date(),
): Record<FsrsRating, string> {
  const base = card ?? createEmptyCard(now);
  const format = (days: number, due: Date): string => {
    if (days < 1) {
      const mins = Math.max(
        1,
        Math.round((due.getTime() - now.getTime()) / 60_000),
      );
      if (mins < 60) return `${mins} min`;
      return `${Math.round(mins / 60)} hr`;
    }
    if (days === 1) return "1 day";
    return `${Math.round(days)} days`;
  };
  const out = {} as Record<FsrsRating, string>;
  for (const rating of [1, 2, 3, 4] as FsrsRating[]) {
    const next = scheduler.next(toTsCard(base), now, RATING_MAP[rating]);
    const due =
      next.card.due instanceof Date
        ? next.card.due
        : new Date(next.card.due);
    out[rating] = format(next.card.scheduled_days, due);
  }
  return out;
}
