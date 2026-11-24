/**
 * Clean distilled Drive segment text for storage and display.
 * Strips markdown chrome, glossary-card leftovers, list markers, and
 * headings glued onto the next word.
 */

import { FRAMEWORK_CATALOG } from "@/lib/frameworks/catalog";
import { cleanReaderText } from "@/lib/text/reader-text";

/** Plain labels students understand (never raw enum strings). */
export function plainFileTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case "practice_transcript":
      return "From practice";
    case "team_notes":
      return "Team notes";
    case "research":
      return "Research";
    case "coach_guidance":
      return "Coach notes";
    case "rules":
      return "Rules";
    case "case_set":
      return "Case set";
    case "general":
      return "Drive file";
    default:
      return "Drive file";
  }
}

const FRAMEWORK_PHRASES = (() => {
  const set = new Set<string>();
  for (const e of FRAMEWORK_CATALOG) {
    set.add(e.term.toLowerCase());
    for (const a of e.aliases) set.add(a.toLowerCase());
  }
  return [...set].sort((a, b) => b.length - a.length);
})();

/** Markdown links become their link text. */
function stripMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\((?:[^)]+)\)/g, "$1");
}

/** Leading bullets, asterisks, and numbered list markers. */
function stripListMarkers(text: string): string {
  return text
    .split(/\n+/)
    .map((line) =>
      line
        .replace(/^\s*(?:[-*•]+|\d+[.)])\s+/, "")
        .replace(/\s+\*\s*$/, "")
        .replace(/:\s*\*\s*$/, ":")
        .trim(),
    )
    .filter(Boolean)
    .join(" ");
}

/**
 * Glossary / framework hover-card leftovers: a term stuck to its definition,
 * then "On this case:" and "Read more (...)". Keep the useful plain sentence.
 */
function stripGlossaryCardLeftovers(text: string): string {
  let t = text;

  const onCase = t.match(
    /On this case:\s*([\s\S]+?)(?:\s*(?:\[?Read more|\(|$))/i,
  );
  if (/On this case:/i.test(t) && onCase?.[1]) {
    const apply = onCase[1]
      .replace(/\[Read more[^\]]*\](?:\([^)]*\))?/gi, "")
      .replace(/Read more\s*\([^)]*\)/gi, "")
      .replace(/:\s*$/, "")
      .trim();
    if (apply.length > 12) return apply;
  }

  t = t
    .replace(/\s*\[Read more[^\]]*\](?:\([^)]*\))?/gi, "")
    .replace(/\s*Read more\s*\([^)]*\)/gi, "")
    .replace(/\s*On this case:\s*/gi, " ")
    .trim();

  for (const e of FRAMEWORK_CATALOG) {
    const expl = e.explanation.trim();
    const first = expl.split(/(?<=[.!?])\s+/)[0] ?? expl;
    if (first.length < 20) continue;
    const idx = t.indexOf(first);
    if (idx <= 0) continue;
    const before = t.slice(0, idx).replace(/\s+/g, " ").trim();
    const beforeNorm = before.toLowerCase().replace(/[^a-z]+/g, "");
    const termNorm = [e.term, ...e.aliases]
      .map((x) => x.toLowerCase().replace(/[^a-z]+/g, ""))
      .filter((x) => x.length >= 4);
    if (
      termNorm.some(
        (tn) =>
          beforeNorm === tn ||
          beforeNorm.endsWith(tn) ||
          tn.includes(beforeNorm),
      ) ||
      beforeNorm.length < 40
    ) {
      return t.slice(idx).trim();
    }
  }

  return t;
}

/**
 * Insert a space where a known framework phrase was glued to the next word
 * (e.g. "Humanity formulacategorical imperativeKant's…").
 */
function unglueFrameworkPhrases(text: string): string {
  let t = text;
  for (const phrase of FRAMEWORK_PHRASES) {
    if (phrase.length < 5) continue;
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(${escaped})(?=[A-Za-z])`, "gi");
    t = t.replace(re, "$1 ");
  }
  t = t.replace(/([a-z])([A-Z])/g, "$1 $2");
  return t.replace(/[ \t]{2,}/g, " ").trim();
}

/** True when a point is empty or only a symbol / marker. */
export function isEmptyPoint(text: string): boolean {
  const t = text.replace(/[\s*•\-–—_:.,;!?]+/g, "").trim();
  return t.length <= 1;
}

/**
 * Clean one distilled point (or "what" blurb) for storage and display.
 */
export function cleanSegmentBody(raw: string): string {
  if (!raw) return "";
  let t = cleanReaderText(raw);
  t = stripMarkdownLinks(t);
  t = stripGlossaryCardLeftovers(t);
  t = stripMarkdownLinks(t);
  t = unglueFrameworkPhrases(t);
  t = stripListMarkers(t);
  t = t
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .trim();
  if (isEmptyPoint(t)) return "";
  // Lone labels like "Imperative:" with no content.
  if (/^[A-Za-z][\w\s'-]{0,40}:\s*$/.test(t)) return "";
  return t;
}

/** True when stored text still carries chrome that cleaning would remove. */
export function segmentBodyNeedsClean(raw: string): boolean {
  if (!raw) return true;
  if (/\[([^\]]+)\]\([^)]+\)/.test(raw)) return true;
  if (/On this case:/i.test(raw)) return true;
  if (/Read more\s*\(/i.test(raw)) return true;
  if (/^\s*[-*•]\s*$/m.test(raw)) return true;
  if (/:\s*\*\s*$/m.test(raw)) return true;
  if (/formulacategorical|imperativeKant|ethicsUtilitarian/i.test(raw)) {
    return true;
  }
  if (isEmptyPoint(raw)) return true;
  return raw.includes("*") && cleanSegmentBody(raw) !== raw.trim();
}
