/**
 * Small mood event bus. Pages emit context; useCruxyMood listens.
 * CSS / rAF consumers (confetti host) can subscribe too.
 */
import type { CruxyPose } from "./poses";

export type MoodBusEvent =
  | { type: "cruxy.writing" }
  | { type: "cruxy.idle" }
  | { type: "user.ask" }
  | { type: "flashcard.correct" }
  | { type: "flashcard.miss" }
  | { type: "idea.accepted" }
  | { type: "score.jump"; delta: number }
  | { type: "roadmap.stage_done"; stage?: string }
  | { type: "milestone"; label?: string }
  | { type: "pose.set"; pose: CruxyPose; holdMs?: number };

export type MoodBusMap = {
  pose: CruxyPose;
  holdMs: number;
  /** Gentle copy for sad / miss; never mocking. */
  bubble?: string | null;
  confetti?: boolean;
};

type Listener = (event: MoodBusEvent, mapped: MoodBusMap) => void;

const listeners = new Set<Listener>();

export function mapMoodEvent(event: MoodBusEvent): MoodBusMap {
  switch (event.type) {
    case "cruxy.writing":
      return { pose: "thinking", holdMs: 0 };
    case "cruxy.idle":
      return { pose: "sleepy", holdMs: 0 };
    case "user.ask":
      return { pose: "curious", holdMs: 0 };
    case "flashcard.correct":
      return { pose: "happy", holdMs: 4500 };
    case "flashcard.miss":
      return {
        pose: "sad",
        holdMs: 4500,
        bubble: "Missed that one. Try it again soon.",
      };
    case "idea.accepted":
      return { pose: "happy", holdMs: 5000, bubble: "Idea accepted." };
    case "score.jump":
      return event.delta >= 2
        ? {
            pose: "surprised",
            holdMs: 5500,
            bubble: "A big jump from your own past.",
          }
        : { pose: "happy", holdMs: 4000 };
    case "roadmap.stage_done":
      return {
        pose: "excited",
        holdMs: 6000,
        confetti: true,
        bubble: event.stage
          ? `${event.stage} done. Onward.`
          : "Stage done. Onward.",
      };
    case "milestone":
      return {
        pose: "excited",
        holdMs: 6000,
        confetti: true,
        bubble: event.label ?? "A milestone. Nice work.",
      };
    case "pose.set":
      return { pose: event.pose, holdMs: event.holdMs ?? 4000 };
  }
}

export function emitMood(event: MoodBusEvent): MoodBusMap {
  const mapped = mapMoodEvent(event);
  for (const fn of listeners) {
    try {
      fn(event, mapped);
    } catch {
      // never break callers
    }
  }
  return mapped;
}

export function subscribeMood(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
