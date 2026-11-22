/**
 * Cut one case out of the case-set PDF text and make it readable.
 *
 * The case set arrives as one long PDF: a cover page, a contents list, then
 * every case, with page footers and footnotes mixed into the prose. This
 * returns only the asked-for case, as short paragraphs, with footnotes moved
 * into a numbered sources list and the in-text markers shown as [n].
 *
 * Checked against the 2026 regional set: all 15 cases come out with no
 * footer or citation text left in the body, and all 92 footnotes matched.
 */

export type CaseSectionParagraph = {
  text: string;
  /** Passage the paragraph starts in, so highlights and notes attach to a real passage. */
  passage_id: string | null;
};

export type CaseSection = {
  paragraphs: CaseSectionParagraph[];
  sources: { n: number; text: string }[];
};

type PassageLike = { id: string; text: string };

const FOOTER_RE =
  /\s*(?:\d{1,3})?\s*©\s*20\d\d Regional IEB Case Set\s*\|.*?Sunny Lloyd\s*/g;
/** In-text footnote marker: "guardrails.1 Anthropic", "processing,21 success", "in 1871.50 This". */
const REF_RE =
  /(?<=[A-Za-z”"’)\]]|\b\d{4})([.,;:?!”"’]{0,2})(\d{1,3})(?=\s|$)/g;
const PARAGRAPH_CHARS = 620;

function looksLikeCitation(t: string): boolean {
  return /\b(1[89]|20)\d\d\b|n\.d\.|https?:|doi/.test(t);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalise(s: string): string {
  return s.replace(/\[\d+\]/g, "").replace(/\s+/g, " ").trim();
}

/** Split the whole PDF into body text and a footnote map. */
function bodyAndNotes(passages: PassageLike[]): {
  body: string;
  notes: Map<number, string>;
} {
  const full = passages.map((p) => p.text).join(" ").replace(/\s+/g, " ");
  const pages = full.split(FOOTER_RE);
  const notes = new Map<number, string>();
  const bodies: string[] = [];
  let nextNote = 1;

  for (const page of pages) {
    const refs = [...page.matchAll(REF_RE)]
      .map((m) => ({ n: Number(m[2]), i: m.index ?? 0 }))
      .filter((r) => r.n >= nextNote && r.n < nextNote + 40);
    if (!refs.length) {
      bodies.push(page);
      continue;
    }
    const k = Math.min(...refs.map((r) => r.n));
    let cut = -1;
    const startRe = new RegExp(`\\s${k} (?=\\S)`, "g");
    startRe.lastIndex = refs[0]!.i + 1;
    let m: RegExpExecArray | null;
    while ((m = startRe.exec(page))) {
      if (looksLikeCitation(page.slice(m.index, m.index + 400))) {
        cut = m.index;
        break;
      }
    }
    if (cut < 0) {
      bodies.push(page);
      continue;
    }

    const block = page.slice(cut);
    const starts: [number, number][] = [];
    let j = k;
    let pos = 0;
    for (;;) {
      const re = new RegExp(`(?:^|\\s)${j} (?=\\S)`, "g");
      re.lastIndex = pos;
      let got: RegExpExecArray | null = null;
      let mm: RegExpExecArray | null;
      while ((mm = re.exec(block))) {
        if (looksLikeCitation(block.slice(mm.index, mm.index + 400))) {
          got = mm;
          break;
        }
      }
      if (!got) break;
      starts.push([j, got.index]);
      pos = got.index + 1;
      j += 1;
    }
    starts.forEach(([n, s], i) => {
      const e = i + 1 < starts.length ? starts[i + 1]![1] : block.length;
      const text = block
        .slice(s, e)
        .trim()
        .replace(/^\d+\s/, "")
        // PDF line wraps put a space inside long links: "case-against- government".
        .replace(/(https?:\/\/\S*?-)\s+(?=\S)/g, "$1");
      notes.set(n, text);
    });
    if (starts.length) nextNote = starts[starts.length - 1]![0] + 1;
    bodies.push(page.slice(0, cut));
  }
  return { body: bodies.join(" ").replace(/\s+/g, " "), notes };
}

/** One case from the case-set passages, or null when its heading is not found. */
export function extractCaseSection(
  passages: PassageLike[],
  caseNumber: number,
  caseTitle: string,
): CaseSection | null {
  if (!passages.length) return null;
  const { body, notes } = bodyAndNotes(passages);

  const words = caseTitle
    .replace(/^the\s+/i, "")
    .replace(/[^\w\s]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(escapeRe);
  if (!words.length) return null;
  const headRe = new RegExp(
    `(?:^|\\s)${caseNumber}\\.\\s+(?:The\\s+)?${words.join("\\W+")}`,
    "gi",
  );
  const heads = [...body.matchAll(headRe)];
  if (!heads.length) return null;
  // The contents page lists every title first; the case itself is the last match.
  const start = heads[heads.length - 1]!.index ?? 0;
  const nextRe = new RegExp(`\\s${caseNumber + 1}\\.\\s+[A-Z“"]`, "g");
  nextRe.lastIndex = start + 40;
  const next = nextRe.exec(body);
  let section = body
    .slice(start, next ? next.index : body.length)
    .trim()
    .replace(new RegExp(`^${caseNumber}\\.\\s+`), "");
  for (const t of [caseTitle, caseTitle.replace(/^the\s+/i, "")]) {
    if (section.toLowerCase().startsWith(t.toLowerCase())) {
      section = section.slice(t.length).trim();
      break;
    }
  }

  const used: number[] = [];
  section = section.replace(REF_RE, (whole, punct: string, num: string) => {
    const n = Number(num);
    if (!notes.has(n)) return whole;
    used.push(n);
    return `${punct}[${n}]`;
  });

  const sentences = section.split(
    /(?<=[.?!][”"’]?(?:\[\d+\])?)\s+(?=[A-Z“"‘])/,
  );
  const texts: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && cur.length + s.length > PARAGRAPH_CHARS) {
      texts.push(cur);
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur) texts.push(cur);

  const normPassages = passages.map((p) => ({ id: p.id, text: normalise(p.text) }));
  let lastId: string | null = passages[0]?.id ?? null;
  const paragraphs = texts.map((text) => {
    const probe = normalise(text).slice(0, 40);
    const hit = normPassages.find((p) => p.text.includes(probe));
    if (hit) lastId = hit.id;
    return { text, passage_id: hit?.id ?? lastId };
  });

  return {
    paragraphs,
    sources: [...new Set(used)]
      .sort((a, b) => a - b)
      .map((n) => ({ n, text: notes.get(n) ?? "" })),
  };
}
