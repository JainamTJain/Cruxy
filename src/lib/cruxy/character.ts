/**
 * Cruxy character policy (F-027 to F-032):
 * - Answer directly when someone wants information.
 * - Ask one specific question first only when they want Cruxy to do their thinking,
 *   then still answer.
 * - Never a generic canned question.
 *
 * Prompt quality lives in Workstream H. This module decides *when* to ask, hint,
 * or answer; the drawer and agents use it for routing.
 */

export type CharacterMode = "ask" | "direct" | "hint";

export type CharacterDecision = {
  mode: CharacterMode;
  /** Specific Socratic question when mode is ask. Never a generic canned line. */
  question?: string;
  /** Why this mode was chosen (for tests and logging). */
  reason:
    | "hint"
    | "admin"
    | "timed"
    | "short_on_time"
    | "already_asked"
    | "information"
    | "thinking"
    | "default_direct";
};

/** Lookups, logistics, explain/summarize, who/what/where: answer straight away. */
const INFORMATION_RE =
  /\b(what is|what's|whats|who(?:'s| is| are| has| haven't| hasn't)?|whom|where|when|which|how many|how much|explain|summarize|summarise|define|list|tell me about|what time|schedule|deadline|room|zoom|link|url|drive|passcode|code|logistics|attendance|readiness brief|what did|what changed|what happened)\b/i;

/** The person wants Cruxy to do their reasoning with them. */
const THINKING_RE =
  /\b(help me (think|argue|reason|strengthen|improve|rewrite|build|answer|respond)|how should i|what would you|critique (my|this)|steelman|counter-?argu|what should (our|my) (claim|argument|line)|push back|how do i (answer|respond|frame)|walk me through|think (this|it) through|is (my|this) (claim|argument) (weak|strong)|how can i (make|fix))\b/i;

/**
 * Build one specific question from what they asked. Never falls back to a
 * canned "What would the other side say?" style line.
 */
export function buildSpecificQuestion(userQuestion: string): string {
  const q = userQuestion.trim().replace(/\s+/g, " ");
  if (!q) {
    return "What are you trying to figure out in one sentence?";
  }

  const caseMatch = q.match(/\bcase\s+(\d{1,2})\b/i);
  const caseBit = caseMatch ? ` for Case ${caseMatch[1]}` : "";

  const claimMatch = q.match(/\bclaim\s*(\d)\b/i);
  if (claimMatch) {
    return `Before I weigh in: what is Claim ${claimMatch[1]}${caseBit} in your own words, in one sentence?`;
  }

  if (/\b(counter|oppos|other side|commentar)/i.test(q)) {
    return `Before I weigh in${caseBit}: what is the strongest point the other side would press right now?`;
  }

  if (/\b(framework|principle|kant|utilitar|care ethic|virtue)/i.test(q)) {
    return `Before I weigh in${caseBit}: which principle are you defending, in plain words?`;
  }

  if (/\b(strengthen|improve|rewrite|fix|weak)/i.test(q)) {
    return `Before I weigh in${caseBit}: which sentence feels weakest to you right now?`;
  }

  if (/\b(respond|answer|push back|q\s*&?\s*a|judge)/i.test(q)) {
    return `Before I weigh in${caseBit}: what is the one fact or value you would lead with?`;
  }

  // Pull a short topic phrase so the question stays about *their* ask.
  const topic = q
    .replace(/^(please|can you|could you|help me|i need|i want)\s+/i, "")
    .replace(/[?.!]+$/g, "")
    .trim();
  const short =
    topic.length > 72 ? `${topic.slice(0, 69).trim()}...` : topic;
  return `Before I weigh in: what do you already think about "${short}"?`;
}

/** True when the message is an information ask (answer directly). */
export function wantsInformation(question: string): boolean {
  return INFORMATION_RE.test(question);
}

/** True when the person wants Cruxy to do their thinking with them. */
export function wantsThinkingHelp(question: string): boolean {
  return THINKING_RE.test(question);
}

/**
 * Decide ask vs direct. Timed rounds, admin mode, information asks, and
 * short-on-time skip the Socratic step. Thinking help gets one specific
 * question; the caller still answers after (or with) that question.
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
  if (opts.wantsHint) return { mode: "hint", reason: "hint" };
  if (opts.adminMode) return { mode: "direct", reason: "admin" };
  if (opts.timedRound) return { mode: "direct", reason: "timed" };
  if (opts.shortOnTime) return { mode: "direct", reason: "short_on_time" };
  if (opts.alreadyAsked || opts.triedAnswer) {
    return { mode: "direct", reason: "already_asked" };
  }
  // Information always wins over thinking patterns ("explain how I should..."
  // still starts with explain → direct).
  if (wantsInformation(opts.question)) {
    return { mode: "direct", reason: "information" };
  }
  if (wantsThinkingHelp(opts.question)) {
    return {
      mode: "ask",
      question: buildSpecificQuestion(opts.question),
      reason: "thinking",
    };
  }
  // Default: answer. Do not ambush with a canned Socratic prompt.
  return { mode: "direct", reason: "default_direct" };
}

/** @deprecated Use buildSpecificQuestion. Kept for older call sites. */
export function pickSocraticQuestion(seed?: string): string {
  return buildSpecificQuestion(seed ?? "");
}

export const CALL_QUESTION =
  "You called. What are you trying to figure out?";

export const HINT_FALLBACK =
  "Here's one hint: try restating the claim in one sentence before you reach for a framework.";

export const SLEEP_GOODBYE =
  "Back to the lamp. Tap it whenever you want to think something through.";

/** Plain spend-cap and timeout copy for the floating chat and drawer. */
export const SPEND_CAP_MESSAGE =
  "Cruxy's spend cap for now is reached. Reading and flashcard review still work. Try again after the cap resets, or ask Jainam.";

export const TIMEOUT_MESSAGE =
  "That took too long. Try a shorter question, or tap Expand and ask again.";

export const EMPTY_SOURCE_MESSAGE =
  "I couldn't find a source for this.";

export function isSpendCapError(text: string | undefined | null): boolean {
  if (!text) return false;
  return /spend cap|monthly.*cap|per-feature cap|cap reached/i.test(text);
}

export function isTimeoutError(text: string | undefined | null): boolean {
  if (!text) return false;
  return /timeout|timed out|took too long|AbortError|deadline/i.test(text);
}

export function friendlyCruxyError(
  status: number,
  errorText?: string | null,
): string {
  if (isSpendCapError(errorText)) return SPEND_CAP_MESSAGE;
  if (status === 408 || isTimeoutError(errorText)) return TIMEOUT_MESSAGE;
  if (errorText && errorText.length < 200 && !/internal|exception|stack/i.test(errorText)) {
    return errorText;
  }
  return "Cruxy hit a problem. Try again, or tap Expand.";
}
