import { looksLikeReadableText } from "@/lib/library/text-quality";
import { randomUUID } from "crypto";
import { runLibrarianTag } from "@/lib/cruxy/agents/librarian";
import type { LibrarianTagOutput } from "@/lib/cruxy/schemas/librarian";
import { normalizeFiveLineCard } from "@/lib/library/file-card";
import { checksumOf, embedPassageText, stubEmbed } from "@/lib/library/embeddings";
import { normalizeExtractedText } from "@/lib/library/join-extracted-text";
import type { CaseRow } from "@/lib/types";
import {
  PASSAGE_TARGET_WORDS,
  SORTING_CONFIDENCE_THRESHOLD,
  type DriveListedFile,
  type LibraryFile,
  type LibraryFileType,
  type Passage,
} from "@/lib/library/types";
import { inferUnreadableReason } from "@/lib/library/unreadable";
import { nowIso } from "@/lib/utils";

export type DigestedIdea = LibrarianTagOutput["ideas"][number];

const FILE_TYPES: LibraryFileType[] = [
  "case_set",
  "practice_transcript",
  "team_notes",
  "rules",
  "research",
  "coach_guidance",
  "general",
];

export type DigestResult = {
  file: LibraryFile;
  passages: Passage[];
  aiCalls: number;
  ideas: DigestedIdea[];
};

/** Heuristic Librarian when AI key is missing or response is unusable. */
export function heuristicTag(
  listed: DriveListedFile,
  text: string,
  cases: CaseRow[],
): {
  case_numbers: number[];
  type: LibraryFileType;
  confidence: number;
  card: string;
  ideas: DigestedIdea[];
} {
  const lower = `${listed.name} ${listed.path} ${text}`.toLowerCase();
  let type: LibraryFileType = "general";
  if (/case set|ieb case/i.test(lower)) type = "case_set";
  else if (/transcript|practice/i.test(lower)) type = "practice_transcript";
  else if (/notes|prep/i.test(lower)) type = "team_notes";
  else if (/rule|scoring|appe/i.test(lower)) type = "rules";
  else if (/research|source|article/i.test(lower)) type = "research";
  else if (/coach|dr\.?\s*b|guidance/i.test(lower)) type = "coach_guidance";

  const case_numbers: number[] = [];
  for (const c of cases) {
    if (!c.active) continue;
    const patterns = [
      new RegExp(`case\\s*${c.number}\\b`, "i"),
      new RegExp(`\\bc${c.number}\\b`, "i"),
    ];
    if (patterns.some((p) => p.test(lower))) {
      case_numbers.push(c.number);
    }
  }
  if (type === "case_set" && case_numbers.length === 0) {
    case_numbers.push(...cases.filter((c) => c.active).map((c) => c.number));
  }
  if (type === "rules" || type === "general") {
    // leave empty → "general" cases
  }

  const confidence =
    type === "general" && case_numbers.length === 0
      ? 0.45
      : case_numbers.length > 0
        ? 0.88
        : 0.75;

  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const card = normalizeFiveLineCard({
    name: listed.name,
    caseNumbers: case_numbers,
    type,
    newLine: lines[1]?.slice(0, 120) ?? "See passages.",
    openLine:
      type === "practice_transcript"
        ? "Ideas for Evidence Library?"
        : "Any gaps vs claim maps?",
  });

  const ideas: DigestedIdea[] = [];
  if (type === "practice_transcript") {
    for (const line of lines) {
      if (/idea\s*[-:—]/i.test(line) || /idea raised/i.test(line)) {
        const cleaned = line.replace(/^\[.*?\]\s*/, "").slice(0, 280);
        const who =
          cleaned.match(/^([A-Za-z][A-Za-z .'-]{1,40}):\s*/)?.[1] ?? null;
        ideas.push({
          text: cleaned,
          kind: "other",
          who,
          citation_ids: [],
          strength: "normal",
        });
      }
      if (/\bframework\b/i.test(line)) {
        ideas.push({
          text: line.replace(/^\[.*?\]\s*/, "").slice(0, 280),
          kind: "framework",
          who: null,
          citation_ids: [],
          strength: "normal",
        });
      }
    }
  }

  return { case_numbers, type, confidence, card, ideas };
}

export async function librarianTag(input: {
  listed: DriveListedFile;
  text: string;
  cases: CaseRow[];
  personId?: string | null;
  /** When true, skip callCruxy entirely (used by tests / force-heuristic). */
  forceHeuristic?: boolean;
}): Promise<{
  case_numbers: number[];
  type: LibraryFileType;
  confidence: number;
  card: string;
  ideas: DigestedIdea[];
  aiCalls: number;
}> {
  const fallback = heuristicTag(input.listed, input.text, input.cases);
  if (input.forceHeuristic) {
    return { ...fallback, aiCalls: 0 };
  }

  const tagged = await runLibrarianTag({
    listed: input.listed,
    text: input.text,
    cases: input.cases,
    personId: input.personId,
    stubFallback: () => ({
      case_numbers: fallback.case_numbers,
      type: fallback.type,
      confidence: fallback.confidence,
      card: fallback.card,
      ideas: fallback.ideas,
      frameworks: [],
      facts: [],
      moderator_questions: [],
      coach_decisions: [],
    }),
  });

  const type = FILE_TYPES.includes(tagged.type as LibraryFileType)
    ? (tagged.type as LibraryFileType)
    : fallback.type;

  const ideas: DigestedIdea[] = [
    ...tagged.ideas,
    ...(tagged.frameworks ?? []).map((text) => ({
      text,
      kind: "framework" as const,
      who: null,
      citation_ids: [] as string[],
      strength: "normal" as const,
    })),
    ...(tagged.facts ?? []).map((f) => ({
      text: f.source ? `${f.text} (${f.source})` : f.text,
      kind: "fact" as const,
      who: null,
      citation_ids: [] as string[],
      strength: "normal" as const,
    })),
  ];

  // Coach decisions and moderator-style questions become ideas too so they
  // can enter the Evidence Library proposal queue when relevant.
  for (const text of tagged.coach_decisions ?? []) {
    ideas.push({
      text: `Coach decision: ${text}`,
      kind: "other",
      who: null,
      citation_ids: [],
      strength: "strong",
    });
  }
  for (const text of tagged.moderator_questions ?? []) {
    ideas.push({
      text: `Moderator-style: ${text}`,
      kind: "other",
      who: null,
      citation_ids: [],
      strength: "normal",
    });
  }

  const card = normalizeFiveLineCard({
    name: input.listed.name,
    caseNumbers: tagged.case_numbers.length
      ? tagged.case_numbers
      : fallback.case_numbers,
    type,
    card: tagged.card || fallback.card,
  });

  return {
    case_numbers: tagged.case_numbers.length
      ? tagged.case_numbers
      : fallback.case_numbers,
    type,
    confidence: tagged.confidence,
    card,
    ideas,
    aiCalls: tagged.aiCalls,
  };
}

/** Sync split used by tests; embeddings are stubs only. */
export function splitPassages(
  text: string,
  opts: { fileId: string; driveId: string | null; createdBy?: string | null },
): Passage[] {
  return splitPassageBodies(text, opts).map((p) => ({
    ...p,
    embedding: stubEmbed(p.text || "empty"),
  }));
}

function splitPassageBodies(
  text: string,
  opts: { fileId: string; driveId: string | null; createdBy?: string | null },
): Omit<Passage, "embedding">[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [
      {
        id: randomUUID(),
        file_id: opts.fileId,
        drive_id: opts.driveId,
        anchor: "p1",
        text: text || "(empty)",
        ord: 0,
        created_at: nowIso(),
        created_by: opts.createdBy ?? null,
      },
    ];
  }

  const passages: Omit<Passage, "embedding">[] = [];
  let i = 0;
  let ord = 0;
  while (i < words.length) {
    const chunk = words.slice(i, i + PASSAGE_TARGET_WORDS);
    const body = chunk.join(" ");
    const pageGuess = Math.floor(ord / 2) + 1;
    const heading =
      body.match(/^(CASE\s+\d+[^\n]*)/i)?.[1] ??
      body.slice(0, 48).replace(/\s+/g, " ");
    const anchor = `p${pageGuess}:${heading.slice(0, 40)}`;
    passages.push({
      id: randomUUID(),
      file_id: opts.fileId,
      drive_id: opts.driveId,
      anchor,
      text: body,
      ord,
      created_at: nowIso(),
      created_by: opts.createdBy ?? null,
    });
    i += PASSAGE_TARGET_WORDS;
    ord += 1;
  }
  return passages;
}

/** Split ~600-word passages and embed each with the embed tier. */
export async function splitAndEmbedPassages(
  text: string,
  opts: {
    fileId: string;
    driveId: string | null;
    createdBy?: string | null;
    personId?: string | null;
    /** Skip gateway embeds (tests / heuristic-only sync). */
    skipEmbed?: boolean;
  },
): Promise<{ passages: Passage[]; aiCalls: number }> {
  const bodies = splitPassageBodies(text, opts);
  let aiCalls = 0;
  const passages: Passage[] = [];
  // Embed 8 passages at a time so long files finish inside one sync run.
  const BATCH = 8;
  for (let i = 0; i < bodies.length; i += BATCH) {
    const batch = bodies.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (body) => {
        if (opts.skipEmbed || !looksLikeReadableText(body.text)) {
          return {
            body,
            embedding: stubEmbed(body.text || "empty"),
            stub: true,
            calls: 0,
          };
        }
        const emb = await embedPassageText(body.text, {
          personId: opts.personId ?? opts.createdBy,
          feature: "passage_embed",
        });
        return {
          body,
          embedding: emb.embedding,
          stub: emb.stub,
          calls: emb.aiCalls,
        };
      }),
    );
    for (const r of results) {
      aiCalls += r.calls;
      passages.push({
        ...r.body,
        embedding: r.embedding,
        embedding_stub: r.stub,
      });
    }
  }
  return { passages, aiCalls };
}

export async function digestListedFile(input: {
  listed: DriveListedFile;
  text: string;
  scannedPdf: boolean;
  cases: CaseRow[];
  existing?: LibraryFile | null;
  personId?: string | null;
  /** Skip Librarian AI (unchanged re-digest should never call this with AI). */
  skipAi?: boolean;
}): Promise<DigestResult> {
  const fileId = input.existing?.id ?? randomUUID();
  // Defense in depth: join soft wraps and repair glued words even if the
  // caller skipped extractDriveText (tests, stubs, re-digest).
  const text = normalizeExtractedText(input.text);
  const tagged = await librarianTag({
    listed: input.listed,
    text,
    cases: input.cases,
    personId: input.personId,
    forceHeuristic: input.skipAi === true,
  });

  const case_ids = input.cases
    .filter((c) => tagged.case_numbers.includes(c.number))
    .map((c) => c.id);

  const status =
    tagged.confidence < SORTING_CONFIDENCE_THRESHOLD
      ? "sorting_queue"
      : input.scannedPdf
        ? "sorting_queue"
        : "digested";

  const unreadable_reason = inferUnreadableReason({
    scannedPdf: input.scannedPdf,
    mime: input.listed.mime,
    name: input.listed.name,
    text,
  });

  const file: LibraryFile = {
    id: fileId,
    drive_id: input.listed.drive_id,
    name: input.listed.name,
    path: input.listed.path,
    mime: input.listed.mime,
    modified_at: input.listed.modified_at,
    checksum: input.listed.checksum || checksumOf(text),
    case_ids,
    case_numbers: tagged.case_numbers,
    type: tagged.type,
    confidence: tagged.confidence,
    card: tagged.card,
    text_content: text,
    scanned_pdf: input.scannedPdf,
    unreadable_reason,
    status: unreadable_reason ? "sorting_queue" : status,
    extracted_ideas: tagged.ideas.map((i) =>
      i.who ? `${i.who}: ${i.text}` : i.text,
    ),
    created_at: input.existing?.created_at ?? nowIso(),
    created_by: input.personId ?? null,
  };

  const split = await splitAndEmbedPassages(text, {
    fileId,
    driveId: input.listed.drive_id,
    createdBy: input.personId,
    personId: input.personId,
    skipEmbed: input.skipAi === true,
  });

  return {
    file,
    passages: split.passages,
    aiCalls: tagged.aiCalls + split.aiCalls,
    ideas: tagged.ideas,
  };
}
