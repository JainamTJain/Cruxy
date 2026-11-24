/**
 * Repair words glued when a PDF/Doc line or page break was dropped without a
 * space (e.g. "ofAmericans", "andreduce", "command.Private").
 *
 * Only inserts a space when the glued token is not a dictionary word and both
 * halves are. Skips URLs, camelCase products like iPhone, and real words.
 */

import { isDictionaryWord } from "@/lib/library/word-list";

const URL_RE = /https?:\/\/[^\s]+|www\.[^\s]+|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/** Closing punctuation that should have a space before the next word. */
const CLOSING_PUNCT = new Set([".", "!", "?", ",", ";", ":", ")", "]", "}", '"', "'", "\u201d", "\u2019"]);

export type RepairChange = {
  from: string;
  to: string;
  index: number;
};

export type RepairResult = {
  text: string;
  changes: RepairChange[];
};

/**
 * Insert missing spaces created by bad joins. Safe for names, URLs, and
 * camelCase products (iPhone, eBay): those are left alone.
 */
export function repairRunTogetherWords(text: string): string {
  return repairRunTogetherWordsDetailed(text).text;
}

export function repairRunTogetherWordsDetailed(text: string): RepairResult {
  if (!text) return { text, changes: [] };

  const protectedSpans = protectMatches(text, URL_RE);
  let work = protectedSpans.text;
  const changes: RepairChange[] = [];

  // 1) Closing / sentence punct glued to the next word: "command.Private"
  work = repairPunctuationJoins(work, changes);

  // 2) Letter-letter joins: "ofAmericans", "andreduce", "today'sAI"
  work = repairLetterJoins(work, changes);

  return {
    text: restoreMatches(work, protectedSpans.tokens),
    changes,
  };
}

function protectMatches(
  text: string,
  re: RegExp,
): { text: string; tokens: string[] } {
  const tokens: string[] = [];
  const out = text.replace(re, (m) => {
    const i = tokens.length;
    tokens.push(m);
    return `\u0000URL${i}\u0000`;
  });
  return { text: out, tokens };
}

function restoreMatches(text: string, tokens: string[]): string {
  return text.replace(/\u0000URL(\d+)\u0000/g, (_, n) => tokens[Number(n)] ?? "");
}

function repairPunctuationJoins(text: string, changes: RepairChange[]): string {
  // Period / ! / ? / ; / : / closing quote-paren before a letter, with no space.
  // Skip lowercase after "." (file.txt, e.g.example edge) unless it's clearly a
  // new sentence via uppercase — uppercase is the reliable case-set signal.
  return text.replace(/([.!?])(["’”)\]]*)([A-Za-z])/g, (full, punct, closer, letter, offset) => {
    // Abbreviation / initials: single capital before the period (U.S. / E.g.)
    const before = text.slice(Math.max(0, offset - 2), offset);
    if (/[A-Z]\.$/.test(before + punct) && /[A-Z]/.test(letter)) {
      // "U.S.Army" → still want a space before Army when Army is a full word.
      // Only skip when the letter after is a single-letter initial pattern later.
    }
    // Initials and abbreviations: "U.S.", "J.K.": a capital right after the
    // period that is itself followed by a period is the next initial.
    const after = text.charAt(offset + full.length);
    if (punct === "." && /[A-Z]/.test(letter) && after === ".") {
      return full;
    }
    // Domains / decimals: digit or lowercase letter immediately before "." and
    // lowercase after — leave alone.
    if (punct === "." && /[a-z0-9]$/.test(text.slice(0, offset)) && /[a-z]/.test(letter)) {
      return full;
    }
    const fixed = `${punct}${closer} ${letter}`;
    changes.push({ from: full, to: fixed, index: offset });
    return fixed;
  });
}

function repairLetterJoins(text: string, changes: RepairChange[]): string {
  // Token: letters with optional internal apostrophes (today's, don't).
  const tokenRe = /[A-Za-z]+(?:['\u2019][A-Za-z]+)*/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(text))) {
    out += text.slice(last, m.index);
    const token = m[0];
    const fixed = splitGluedToken(token);
    if (fixed !== token) {
      changes.push({ from: token, to: fixed, index: m.index });
    }
    out += fixed;
    last = m.index + token.length;
  }
  out += text.slice(last);
  return out;
}

/**
 * Try every split of a glued token; accept when both halves are dictionary
 * words and the whole token is not.
 */
function splitGluedToken(token: string): string {
  if (token.length < 4) return token;
  if (isDictionaryWord(token)) return token;

  // camelCase product / brand: single leading lowercase + Capital (iPhone, eBay).
  if (/^[a-z][A-Z]/.test(token)) return token;

  // Prefer a lower→Upper boundary when present (ofAmericans, today'sAI).
  const camelBoundary = token.search(/[a-z][A-Z]/);
  if (camelBoundary >= 1) {
    const left = token.slice(0, camelBoundary + 1);
    const right = token.slice(camelBoundary + 1);
    if (looksLikeValidSplit(left, right, token)) {
      return `${left} ${right}`;
    }
    // If camel split failed, still try other splits below.
  }

  // Apostrophe boundary: today'sAI → today's + AI
  const apos = token.search(/['\u2019][A-Za-z]/);
  if (apos >= 1) {
    // Try splits after the apostrophe letter (…'s|AI).
    for (let i = apos + 2; i < token.length - 1; i++) {
      const left = token.slice(0, i);
      const right = token.slice(i);
      if (looksLikeValidSplit(left, right, token)) {
        return `${left} ${right}`;
      }
    }
  }

  // A capitalized word with no case change inside is a name ("Dario",
  // "Amodei") or a proper noun: never split it on dictionary halves.
  if (/^[A-Z]/.test(token)) return token;

  // Lower+lower (andreduce, treatedtactical): try splits, prefer the longest
  // left that still yields two dictionary words (avoids a|ndreduce).
  let bestLeftLen = -1;
  let best: string | null = null;
  for (let i = 2; i <= token.length - 2; i++) {
    const left = token.slice(0, i);
    const right = token.slice(i);
    if (!looksLikeValidSplit(left, right, token)) continue;
    if (left.length > bestLeftLen) {
      bestLeftLen = left.length;
      best = `${left} ${right}`;
    }
  }
  return best ?? token;
}

function looksLikeValidSplit(left: string, right: string, joined: string): boolean {
  if (left.length < 2 || right.length < 2) return false;
  // Never split off a single-letter camel prefix (iPhone).
  if (left.length === 1 && /^[a-z]$/.test(left) && /^[A-Z]/.test(right)) {
    return false;
  }
  if (isDictionaryWord(joined)) return false;
  // All-caps short right half (AI, US, UK, GPT) counts as a word.
  if (/^[A-Z]{2,5}$/.test(right) && isDictionaryWord(left)) {
    return true;
  }
  // Capitalized right half: check lowercase form in the dictionary.
  if (!isDictionaryWord(left)) return false;
  if (!isDictionaryWord(right)) return false;
  return true;
}

/** Exported for tests: whether a char is treated as closing punct. */
export function isClosingPunct(ch: string): boolean {
  return CLOSING_PUNCT.has(ch);
}
