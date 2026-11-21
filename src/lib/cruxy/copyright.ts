/**
 * F-107 Copyright rule: store passages for citation inside Crux, show short
 * quotes only, paraphrase the rest.
 */

/** Max words shown as a verbatim quote in the UI. */
export const MAX_DISPLAY_QUOTE_WORDS = 40;

/** Max characters stored as a quote field on a finding / claim. */
export const MAX_QUOTE_CHARS = 280;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Truncate a quote for display; returns null when empty. */
export function shortQuoteForDisplay(
  text: string,
  maxWords = MAX_DISPLAY_QUOTE_WORDS,
): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}…`;
}

/**
 * Prefer a short quote when present; otherwise paraphrase body (never dump
 * the full stored passage into the UI).
 */
export function displayCitedText(input: {
  quote?: string | null;
  paraphrase?: string | null;
  passage?: string | null;
}): { kind: "quote" | "paraphrase"; text: string } {
  const q = shortQuoteForDisplay(input.quote ?? "");
  if (q) return { kind: "quote", text: q };
  const para = (input.paraphrase ?? "").trim();
  if (para) return { kind: "paraphrase", text: para };
  const passage = shortQuoteForDisplay(input.passage ?? "", 25);
  return {
    kind: "paraphrase",
    text: passage
      ? `Paraphrase: ${passage}`
      : "See the cited source for the full passage.",
  };
}

/** Clip a model quote to the copyright-safe length before saving. */
export function clipQuoteForStorage(quote: string): string {
  const t = quote.trim();
  if (t.length <= MAX_QUOTE_CHARS) return t;
  return `${t.slice(0, MAX_QUOTE_CHARS - 1)}…`;
}

export const COPYRIGHT_PROMPT_LINE =
  "Copyright: store passages for citation inside Crux only. Show short quotes (under 40 words). Paraphrase the rest. Never paste a full chapter or article into the UI.";
