/**
 * F-024 Even-handed: argue every side at full strength; flag leaning examples.
 */

export type LeanSide = "affirmative" | "negative" | "neutral" | "leans";

const LEAN_RE =
  /\b(obviously|clearly only|no serious person|everyone knows|of course)\b/i;

/**
 * Detect when an example or tip leans one way without naming the other side.
 */
export function detectLeanFlag(text: string): string | null {
  if (!text.trim()) return null;
  if (LEAN_RE.test(text)) {
    return "This wording leans one way. Name the strongest reply from the other side.";
  }
  const hasOther =
    /other side|counter|oppose|against|on the other hand|concede/i.test(text);
  const hasPush = /must|should always|never acceptable/i.test(text);
  if (hasPush && !hasOther) {
    return "Example leans one way. Flag the opposing value before you finish.";
  }
  return null;
}

export const EVEN_HANDED_PROMPT_LINE =
  "Even-handed: argue every side of a case at full strength. Keep your own politics out. When an example leans one way, say so in one short line.";
