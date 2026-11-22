/**
 * Distill a Drive file into short organised segments (Wave 8).
 * No walls of text: what it is, key points, questions, speakers.
 */

import { randomUUID } from "crypto";
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
    .slice(0, MAX_QUESTIONS);
}

function keySentences(text: string): string[] {
  const parts = text
    .split(/(?<=[.!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40 && s.length < 260 && !s.includes("?"));
  return parts.slice(0, MAX_POINTS);
}

/** Build short segments for one file. Pure; caller persists. */
export function distillFileSegments(args: {
  file: LibraryFile;
  passages: Passage[];
  caseId?: string | null;
  personId?: string | null;
}): FileSegment[] {
  const now = nowIso();
  const caseId =
    args.caseId ??
    (args.file.case_ids[0] ?? null);
  const joined = args.passages
    .slice()
    .sort((a, b) => a.ord - b.ord)
    .map((p) => p.text)
    .join("\n");
  const card = parseCardLines(args.file.card);
  const segments: FileSegment[] = [];
  let ord = 0;

  const push = (
    kind: FileSegmentKind,
    title: string,
    body: string,
    extra?: Partial<FileSegment>,
  ) => {
    segments.push({
      id: randomUUID(),
      file_id: args.file.id,
      case_id: caseId,
      kind,
      title,
      body: clip(body),
      speaker_name: null,
      ord: ord++,
      citation_anchor: null,
      created_at: now,
      updated_at: now,
      created_by: args.personId ?? null,
      ...extra,
    });
  };

  push(
    "what",
    "What this is",
    card.what ??
      `${args.file.type ?? "File"}: ${args.file.name}${
        args.file.case_numbers.length
          ? ` for case${args.file.case_numbers.length === 1 ? "" : "s"} ${args.file.case_numbers.join(", ")}`
          : ""
      }`,
  );

  if (card.neu) {
    push("note", "What's new", card.neu);
  }

  const points = keySentences(joined);
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

  if (args.file.type === "practice_transcript" || /transcript/i.test(args.file.name)) {
    for (const s of speakerLines(joined)) {
      push("speaker", s.name, s.line, { speaker_name: s.name });
    }
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
