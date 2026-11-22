/**
 * Split imported team documents into per-case chunks by case number, title, headings.
 */
import type { CaseRow } from "@/lib/types";

export type SplitPiece = {
  kind: "found" | "not_in_regional" | "unmatched";
  caseNumber: number | null;
  caseId: string | null;
  titleGuess: string | null;
  sectionCount: number;
  body: string;
};

const CASE_HEADING =
  /(?:^|\n)\s*(?:#+\s*)?(?:case\s*)?#?\s*(\d{1,2})\s*[:.\-–—)]\s*([^\n]{0,120})/gi;

const DROPPED_REGIONAL = new Set([2, 6, 8]);

function countSections(body: string): number {
  const heads = body.match(/(?:^|\n)\s*#{1,3}\s+\S+/g);
  if (heads?.length) return heads.length;
  const paras = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 40);
  return Math.max(paras.length, body.trim() ? 1 : 0);
}

function matchCase(
  num: number,
  titleGuess: string,
  cases: CaseRow[],
): CaseRow | null {
  const byNum = cases.find((c) => c.number === num && c.active);
  if (byNum) return byNum;
  const q = titleGuess.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  if (q.length < 4) return null;
  return (
    cases.find((c) => {
      const t = c.title.toLowerCase();
      return t.includes(q.slice(0, 24)) || q.includes(t.slice(0, 24));
    }) ?? null
  );
}

/**
 * Split a document body into per-case pieces. Orphan text before the first
 * case heading becomes unmatched paragraphs.
 */
export function splitDocumentByCase(
  text: string,
  cases: CaseRow[],
): SplitPiece[] {
  const body = text.replace(/\r\n/g, "\n").trim();
  if (!body) return [];

  const matches: { index: number; num: number; title: string }[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(CASE_HEADING.source, CASE_HEADING.flags);
  while ((m = re.exec(body)) !== null) {
    const num = Number(m[1]);
    if (!Number.isFinite(num) || num < 1 || num > 20) continue;
    matches.push({
      index: m.index + (m[0].startsWith("\n") ? 1 : 0),
      num,
      title: (m[2] ?? "").replace(/\(detailed review\)/i, "").trim(),
    });
  }

  const pieces: SplitPiece[] = [];

  if (matches.length === 0) {
    pieces.push({
      kind: "unmatched",
      caseNumber: null,
      caseId: null,
      titleGuess: null,
      sectionCount: countSections(body),
      body,
    });
    return pieces;
  }

  if (matches[0]!.index > 0) {
    const orphan = body.slice(0, matches[0]!.index).trim();
    if (orphan.length > 40) {
      pieces.push({
        kind: "unmatched",
        caseNumber: null,
        caseId: null,
        titleGuess: null,
        sectionCount: countSections(orphan),
        body: orphan,
      });
    }
  }

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]!;
    const end = matches[i + 1]?.index ?? body.length;
    const chunk = body.slice(cur.index, end).trim();
    if (!chunk) continue;

    if (DROPPED_REGIONAL.has(cur.num)) {
      pieces.push({
        kind: "not_in_regional",
        caseNumber: cur.num,
        caseId: null,
        titleGuess: cur.title || `Case ${cur.num}`,
        sectionCount: countSections(chunk),
        body: chunk,
      });
      continue;
    }

    const hit = matchCase(cur.num, cur.title, cases);
    if (hit) {
      pieces.push({
        kind: "found",
        caseNumber: hit.number,
        caseId: hit.id,
        titleGuess: hit.title,
        sectionCount: countSections(chunk),
        body: chunk,
      });
    } else {
      pieces.push({
        kind: "not_in_regional",
        caseNumber: cur.num,
        caseId: null,
        titleGuess: cur.title || `Case ${cur.num}`,
        sectionCount: countSections(chunk),
        body: chunk,
      });
    }
  }

  return pieces;
}

/** Short review lines for the confirm screen. */
export function formatSplitReview(pieces: SplitPiece[]): string[] {
  const lines: string[] = [];
  for (const p of pieces) {
    if (p.kind === "found") {
      lines.push(
        `Case ${p.caseNumber}: found, ${p.sectionCount} section${p.sectionCount === 1 ? "" : "s"}.`,
      );
    } else if (p.kind === "not_in_regional") {
      lines.push(
        `Case ${p.caseNumber}: not in this regional.`,
      );
    } else {
      const paras = p.body.split(/\n{2,}/).filter((x) => x.trim().length > 40)
        .length;
      lines.push(
        `Not matched: ${Math.max(paras, 1)} paragraph${paras === 1 ? "" : "s"}, choose a case.`,
      );
    }
  }
  return lines;
}
