export type CruxyMood =
  | "curious"
  | "neutral"
  | "winking"
  | "happy"
  | "excited"
  | "surprised"
  | "sad"
  | "sleepy"
  | "angry";

/** Spec events → mood + bubble copy. Mood is never the only signal. */
export type CruxyEvent =
  | "ask.question"
  | "listen.typing"
  | "listen.recording"
  | "hint.given"
  | "feedback.improved"
  | "feedback.answered_well"
  | "personal_best"
  | "version.signed_off"
  | "drift.flagged"
  | "source.new"
  | "judge.unexpected"
  | "feedback.worse"
  | "sleep"
  | "opponent.active"
  | "opponent.done"
  | "call.wake";

export type MoodEventResult = {
  mood: CruxyMood;
  bubble: string | null;
  /** Hold this mood before reverting to curious (ms). Sleepy/fierce managed separately. */
  holdMs: number;
};

const TABLE: Record<CruxyEvent, MoodEventResult> = {
  "ask.question": {
    mood: "curious",
    bubble: null,
    holdMs: 0,
  },
  "listen.typing": {
    mood: "neutral",
    bubble: null,
    holdMs: 0,
  },
  "listen.recording": {
    mood: "neutral",
    bubble: null,
    holdMs: 0,
  },
  "hint.given": {
    mood: "winking",
    bubble: "One hint at a time.",
    holdMs: 6000,
  },
  "feedback.improved": {
    mood: "happy",
    bubble: "Better than your own past. Keep that move.",
    holdMs: 6000,
  },
  "feedback.answered_well": {
    mood: "happy",
    bubble: "That answer landed cleanly.",
    holdMs: 6000,
  },
  personal_best: {
    mood: "excited",
    bubble: "A personal best. Nice work.",
    holdMs: 6000,
  },
  "version.signed_off": {
    mood: "excited",
    bubble: "Your team signed off a new version.",
    holdMs: 6000,
  },
  "drift.flagged": {
    mood: "surprised",
    bubble: "A drift flag just landed. Worth a look.",
    holdMs: 6000,
  },
  "source.new": {
    mood: "surprised",
    bubble: "A new source showed up.",
    holdMs: 6000,
  },
  "judge.unexpected": {
    mood: "surprised",
    bubble: "An unexpected judge comment.",
    holdMs: 6000,
  },
  "feedback.worse": {
    mood: "sad",
    bubble: "That round went worse than your own past. What would you change?",
    holdMs: 6000,
  },
  sleep: {
    mood: "sleepy",
    bubble: null,
    holdMs: 600,
  },
  "opponent.active": {
    mood: "angry",
    bubble: "Playing the other team. Fierce only for the role, never at you.",
    holdMs: 0,
  },
  "opponent.done": {
    mood: "curious",
    bubble: null,
    holdMs: 0,
  },
  "call.wake": {
    mood: "curious",
    bubble: "You called. What are you trying to figure out?",
    holdMs: 0,
  },
};

export function moodForEvent(event: CruxyEvent): MoodEventResult {
  return TABLE[event];
}
