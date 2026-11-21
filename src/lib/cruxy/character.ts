/**
 * Cruxy character policy (F-027 to F-032): asks first, answers directly when
 * asking would waste time, hints one at a time.
 *
 * Prompt quality belongs to Workstream H. This module only decides *when* to
 * ask, hint, or answer, and supplies fallback questions until H's agents land.
 */

export type CharacterMode = "ask" | "direct" | "hint";

export type CharacterDecision = {
  mode: CharacterMode;
  /** Socratic question when mode is ask. */
  question?: string;
};

const LOOKUP_RE =
  /where|when|who|schedule|code|passcode|drive|link|url|what time|deadline|room|zoom/i;

const FALLBACK_QUESTIONS = [
  "What would the other side say?",
  "Which fact matters most here?",
  "Does that fit your principle in Case 12?",
];

export function pickSocraticQuestion(seed?: string): string {
  if (!seed) {
    return FALLBACK_QUESTIONS[
      Math.floor(Math.random() * FALLBACK_QUESTIONS.length)
    ]!;
  }
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * (i + 1)) % 997;
  return FALLBACK_QUESTIONS[h % FALLBACK_QUESTIONS.length]!;
}

/**
 * Decide ask vs direct. Timed rounds, admin mode, lookups, and short-on-time
 * skip the Socratic step.
 */
export function decideCharacterMode(opts: {
  question: string;
  adminMode?: boolean;
  timedRound?: boolean;
  shortOnTime?: boolean;
  alreadyAsked?: boolean;
  wantsHint?: boolean;
  triedAnswer?: boolean;
}): CharacterDecision {
  if (opts.wantsHint) return { mode: "hint" };
  if (
    opts.adminMode ||
    opts.timedRound ||
    opts.shortOnTime ||
    LOOKUP_RE.test(opts.question)
  ) {
    return { mode: "direct" };
  }
  if (opts.alreadyAsked || opts.triedAnswer) {
    return { mode: "direct" };
  }
  return {
    mode: "ask",
    question: pickSocraticQuestion(opts.question),
  };
}

export const CALL_QUESTION =
  "You called. What are you trying to figure out?";

export const HINT_FALLBACK =
  "Here's one hint: try restating the claim in one sentence before you reach for a framework.";
