/**
 * Normalize text pulled from PDFs and Docs at ingest.
 *
 * PDF/Doc extractors often leave soft line wraps as single newlines (or glue
 * words with no separator). Join soft wraps with a space, keep paragraph
 * breaks, and undo only real hyphenated line ends (letter-hyphen-newline-
 * lowercase).
 */

import { repairRunTogetherWords } from "@/lib/library/repair-run-together";

/** Soft hyphen (U+00AD) often marks a PDF wrap. */
const SOFT_HYPHEN = /\u00ad/g;

/**
 * Join extracted lines into readable paragraphs, then run a safe repair for
 * any words already glued without a newline (common in PDF text items).
 */
export function normalizeExtractedText(raw: string): string {
  if (!raw) return raw;
  // Drop NULs / other controls PDFs often carry (tabs and newlines stay).
  const cleaned = raw
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");
  const joined = joinExtractedLines(cleaned);
  return repairRunTogetherWords(joined);
}

/**
 * Join soft line breaks with a space; keep blank-line paragraph breaks;
 * de-hyphenate only wrap hyphens (`surveil-\nlance` → `surveillance`).
 */
export function joinExtractedLines(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.replace(SOFT_HYPHEN, "");

  // Hyphen only for a line wrap: letter- + lowercase → drop the hyphen
  // (surveil-\nlance). letter- + Capital → keep hyphen, drop the break
  // (New-\nYork → New-York).
  text = text.replace(/([A-Za-z])-\n([a-z])/g, "$1$2");
  text = text.replace(/([A-Za-z])-\n([A-Z])/g, "$1-$2");

  const paragraphs = text.split(/\n\s*\n+/);
  const cleaned = paragraphs
    .map((para) =>
      para
        .split("\n")
        .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
        .filter((line) => line.length > 0)
        .join(" "),
    )
    .filter((para) => para.length > 0)
    .join("\n\n");

  return cleaned.replace(/[ \t]{2,}/g, " ").trim();
}
