/**
 * Distill a Drive file into short organised segments (Wave 8).
 * No walls of text: what it is, key points, questions, speakers.
 */

import { randomUUID } from "crypto";
import {
  cleanSegmentBody,
  isEmptyPoint,
  plainFileTypeLabel,
} from "@/lib/library/clean-segment-text";
import type { LibraryFile, Passage } from "@/lib/library/types";
import { nowIso } from "@/lib/utils";

export type FileSegmentKind =
  | "what"
  | "key_point"
  | "question"
  | "speaker"
  | "note";

export type FileSegment = {
  id: string;
  file_id: string;
  case_id: string | null;
  kind: FileSegmentKind;
  title: string;
  body: string;
  speaker_name: string | null;
  ord: number;
  citation_anchor: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

const MAX_POINTS = 5;
const MAX_QUESTIONS = 3;
const MAX_SPEAKERS = 4;
const BODY_CAP = 180;

function clip(text: string, n = BODY_CAP): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1).trim()}…`;
}

function parseCardLines(card: string | null): {
  what: string | null;
  neu: string | null;
  open: string | null;
} {
  if (!card) return { what: null, neu: null, open: null };
  const lines = card.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const find = (prefixes: string[]) => {
    for (const line of lines) {
      for (const p of prefixes) {
        if (line.toLowerCase().startsWith(p.toLowerCase())) {
          const i = line.indexOf(":");
          return i >= 0 ? line.slice(i + 1).trim() : line;
        }
      }
    }
    return null;
  };
  return {
    what: find(["What", "What:"]),
    neu: find(["New", "What's new", "Whats new"]),
    open: find(["Open", "Open questions", "Questions"]),
  };
}

function tidyTranscript(text: string): string {
  return text
    .replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/g, "\n")
    .replace(/\s+(?=[A-Z][A-Za-z.'-]{1,24}\s*:\s)/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function speakerLines(text: string): { name: string; line: string }[] {
  const out: { name: string; line: string }[] = [];
  const re = /^([A-Z][A-Za-z.'-]{1,24})\s*:\s*(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && out.length < MAX_SPEAKERS) {
    out.push({ name: m[1]!, line: clip(m[2]!, 140) });
  }
  return out;
}

function questionSentences(text: string): string[] {
  const parts = text.split(/(?<=[?])/).map((s) => s.trim()).filter(Boolean);
  return parts
    .filter((s) => s.includes("?") && s.length > 12 && s.length < 220)
    .filter((s) => !BOILERPLATE_RE.test(s))
    .slice(0, MAX_QUESTIONS);
}

/**
 * Split on sentence ends, but not after initials (O.C.), common titles or
 * abbreviations, and only where the next sentence starts with a capital.
 */
function splitSentences(text: string): string[] {
  return text
    .split(
      /(?<=[.!])(?<!\b[A-Z]\.)(?<!\b(?:Mr|Ms|Mrs|Dr|Prof|St|vs|etc|e\.g|i\.e|cf|al|No|Vol|pp)\.)\s+(?=["“(]?[A-Z0-9])/,
    )
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Site chrome and publisher notes that are never a key point. */
export const BOILERPLATE_RE =
  /\b(fund|funds|donat\w*|donor\w*|contribution|sponsor\w*|copyright|all rights reserved|cookie\w*|privacy policy|terms of (use|service)|subscri\w*|newsletter|sign (in|up)|log ?in|member benefits|membership|advertis\w*|skip to|share this|follow us|click here|table of contents|academic tools|first published|substantive revision|how to cite|citation information|nicely formatted|pdf version|metaphysics research lab|isbn|issn)\b|©/i;

const STOP = new Set(
  "the a an and or of to in on for with by is are was were be been this that these those it its as at from but not no can could should would will may might do does did has have had their they them we our you your he she his her who whom which what when where why how than then so if into about over under more most less such any each all some one two".split(
    " ",
  ),
);

function terms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .match(/[a-z][a-z'-]{3,}/g)
      ?.filter((w) => !STOP.has(w)) ?? [],
  );
}

/**
 * Up to five substantive sentences: no site boilerplate, no repeats, and,
 * when the case's own terms are given, the ones that use them most (kept in
 * reading order).
 */
function keySentences(text: string, focus?: string): string[] {
  const seen = new Set<string>();
  const parts = splitSentences(text)
    .filter((s) => s.length > 40 && s.length < 260 && !s.includes("?"))
    .filter((s) => !BOILERPLATE_RE.test(s))
    .filter((s) => {
      const key = s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (!focus?.trim()) return parts.slice(0, MAX_POINTS);
  const want = terms(focus);
  const scored = parts.map((s, i) => {
    let score = 0;
    for (const w of terms(s)) if (want.has(w)) score += 1;
    return { s, i, score };
  });
  const top = scored
    .slice()
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, MAX_POINTS)
    .sort((a, b) => a.i - b.i);
  return top.map((x) => x.s);
}

/** Build short segments for one file. Pure; caller persists. */
export function distillFileSegments(args: {
  file: LibraryFile;
  passages: Passage[];
  caseId?: string | null;
  personId?: string | null;
  /** The case's title and crux, to pick the sentences that matter for it. */
  focus?: string;
}): FileSegment[] {
  const now = nowIso();
  const caseId =
    args.caseId ??
    (args.file.case_ids[0] ?? null);
  const isTranscript =
    args.file.type === "practice_transcript" || /transcript/i.test(args.file.name);
  const rawJoined = args.passages
    .slice()
    .sort((a, b) => a.ord - b.ord)
    .map((p) => cleanSegmentBody(p.text))
    .filter(Boolean)
    .join("\n");
  // Transcripts: drop [m:ss] stamps and put each speaker on its own line.
  const joined = isTranscript ? tidyTranscript(rawJoined) : rawJoined;
  const rawCard = parseCardLines(args.file.card);
  const tidyCardLine = (s: string | null) => {
    if (!s) return null;
    const cleaned = cleanSegmentBody(isTranscript ? tidyTranscript(s) : s);
    return cleaned || null;
  };
  const card = {
    what: tidyCardLine(rawCard.what),
    neu: tidyCardLine(rawCard.neu),
    open: tidyCardLine(rawCard.open),
  };
  const segments: FileSegment[] = [];
  let ord = 0;

  const push = (
    kind: FileSegmentKind,
    title: string,
    body: string,
    extra?: Partial<FileSegment>,
  ) => {
    const cleaned = cleanSegmentBody(body);
    if (!cleaned || isEmptyPoint(cleaned)) return;
    segments.push({
      id: randomUUID(),
      file_id: args.file.id,
      case_id: caseId,
      kind,
      title,
      body: clip(cleaned),
      speaker_name: null,
      ord: ord++,
      citation_anchor: null,
      created_at: now,
      updated_at: now,
      created_by: args.personId ?? null,
      ...extra,
    });
  };

  const typeLabel = plainFileTypeLabel(args.file.type);
  push(
    "what",
    "What this is",
    card.what ??
      `${typeLabel}: ${args.file.name}${
        args.file.case_numbers.length
          ? ` for case${args.file.case_numbers.length === 1 ? "" : "s"} ${args.file.case_numbers.join(", ")}`
          : ""
      }`,
  );

  if (card.neu) {
    push("note", "What's new", card.neu);
  }

  const points = isTranscript
    ? speakerLines(joined)
        .slice(0, MAX_POINTS)
        .map((l) => `${l.name}: ${l.line}`)
    : keySentences(joined, args.focus);
  for (const [i, p] of points.entries()) {
    push("key_point", `Key point ${i + 1}`, p, {
      citation_anchor: args.passages[Math.min(i, args.passages.length - 1)]?.anchor ?? null,
    });
  }

  const opens = [
    ...(card.open ? [card.open] : []),
    ...questionSentences(joined),
  ].slice(0, MAX_QUESTIONS);
  for (const [i, q] of opens.entries()) {
    push("question", `Question ${i + 1}`, q);
  }

  if (segments.length <= 1 && joined.trim()) {
    push(
      "key_point",
      "Key point",
      clip(joined, 200),
      { citation_anchor: args.passages[0]?.anchor ?? null },
    );
  }

  return segments;
}