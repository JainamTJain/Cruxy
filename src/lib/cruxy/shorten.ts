/**
 * F-026: answers fit on a phone unless the user asks for more.
 */

export const PHONE_ANSWER_MAX_WORDS = 90;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Trim to a phone-sized answer; keep sentence boundaries when possible. */
export function fitPhoneAnswer(
  text: string,
  maxWords = PHONE_ANSWER_MAX_WORDS,
): { text: string; truncated: boolean } {
  const trimmed = text.trim();
  if (!trimmed) return { text: "", truncated: false };
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return { text: trimmed, truncated: false };

  const cut = words.slice(0, maxWords).join(" ");
  const lastStop = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("? "),
    cut.lastIndexOf("! "),
  );
  const body =
    lastStop > cut.length * 0.4 ? cut.slice(0, lastStop + 1).trim() : cut;
  return { text: `${body} Ask for more if you want the rest.`, truncated: true };
}

/** Cap a research finding point at 40 words (F-102). */
export function capFindingPoint(point: string, maxWords = 40): string {
  const words = point.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ");
}
