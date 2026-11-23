/**
 * Import extra reading straight into a case: a file (PDF, Word, text), a web
 * link or pasted text. Cruxy extracts the text, digests it into a short card
 * (summary, key points with short quotes, ideas the team could use, judge
 * questions) and splits it into passages it searches later when it critiques
 * the working document, researches a teammate's idea or answers on the lamp.
 *
 * Everything stays private to the team, like the import itself.
 */
import "server-only";

import { randomUUID } from "crypto";
import { z } from "zod";
import { addExtraReading } from "@/lib/case-home/extra-reading";
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { sharedSystemPrefix } from "@/lib/cruxy/prompts/shared";
import { isSampleDataMode } from "@/lib/db/config";
import { listCases, logActivity } from "@/lib/db/repository";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { nowIso } from "@/lib/utils";

export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
const MAX_CHARS = 400_000;

export type ReadingDigest = {
  summary: string;
  key_points: { point: string; quote: string | null }[];
  ideas: { use: string; text: string }[];
  questions: string[];
  relevance: string;
  /** Parts of the reading Cruxy marked as most important for the case. */
  bookmarks?: { ord: number; why: string }[];
};

export type ReadingDigestRow = {
  import_id: string;
  team_id: string;
  case_id: string;
  source_url: string | null;
  file_name: string | null;
  chars: number;
  status: "pending" | "done" | "failed";
  digest: ReadingDigest | null;
  error: string | null;
  digested_at: string | null;
};

export type ReadingPassageRow = {
  import_id: string;
  team_id: string;
  case_id: string;
  ord: number;
  anchor: string | null;
  text: string;
};

// ---------- Text extraction ----------

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">",
  rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', hellip: "...",
  ndash: "-", mdash: ",", shy: "", zwj: "", zwnj: "",
};

function decodeEntities(t: string): string {
  return t
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? " ");
}
function safeChar(code: number): string {
  if (!Number.isFinite(code) || code < 9 || code > 0x10ffff) return " ";
  if (code === 0x2018 || code === 0x2019) return "'";
  if (code === 0x201c || code === 0x201d) return '"';
  if (code === 0x2013 || code === 0x2014) return ",";
  return String.fromCodePoint(code);
}

/** Lines that are site furniture, not the article. */
const BOILERPLATE =
  /^(subscribe( to [\w ]+)?|sign ?up|sign in|log ?in|share( this)?( article| story)?|meet the authors?|about the authors?|related( articles| posts| content)?|read more|more from [\w ]+|follow us|newsletter|advertisement|skip to (main )?content|menu|search|print|email|tweet|facebook|twitter|linkedin|copy link|cookies?|accept( all)?( cookies)?|topics?|tags?|comments?|back to top|©.*|copyright.*|all rights reserved\.?)$/i;

/** Readable article text from a web page: headings kept as "## ", one blank line between paragraphs. */
function htmlToText(html: string): { text: string; title: string | null } {
  const rawTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
  const title = rawTitle ? decodeEntities(rawTitle).replace(/\s+/g, " ").trim() : null;
  let src = html.replace(/<!--[\s\S]*?-->/g, " ");
  // Prefer the article itself over the whole page.
  const articles = [...src.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)].map((m) => m[1]!);
  const main = src.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  if (articles.length) src = articles.sort((x, y) => y.length - x.length)[0]!;
  else if (main) src = main;
  src = src
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|button|iframe|figure|template|select)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, _lvl, inner: string) => {
      const t = inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      return t ? `\n\n## ${t}\n\n` : "\n\n";
    })
    .replace(/<li\b[^>]*>/gi, "\n\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|section|article|blockquote|ul|ol|li|tr|table|dl|dt|dd|pre|main)\b[^>]*>/gi, "\n\n")
    // Inline tags (links, emphasis) vanish without leaving a space.
    .replace(/<[^>]+>/g, "");
  let text = decodeEntities(src)
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/ +([,.;:!?)\]])/g, "$1")
    // A tag boundary can swallow the space after a comma ("provide,and").
    .replace(/,(?=[A-Za-z])/g, ", ")
    .replace(/([(\[]) +/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const titleCore = title?.split(/\s+[|:-]\s+/)[0]?.trim().toLowerCase() ?? "";
  let paras = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter((p) => p && p !== "-" && !BOILERPLATE.test(p.replace(/^## /, "")));
  // Drop the page title, byline and author box that sit above the first real paragraph.
  const firstBody = paras.findIndex((p) => !p.startsWith("## ") && p.length >= 200);
  if (firstBody > 0) {
    paras = paras.filter((p, i) => i >= firstBody || (!p.startsWith("## ") && p.length >= 120));
  }
  void titleCore;
  // Cut the tail: topic tags, related links and the author bio.
  const tailAt = paras.findIndex(
    (p, i) =>
      i > paras.length * 0.6 &&
      /^(## )?(topics?|tags?|filed under|related( articles| reading| posts)?|more (from|on) |about the authors?|recommended)\b:?/i.test(p),
  );
  if (tailAt > 0) paras = paras.slice(0, tailAt);
  for (let i = paras.length - 1; i > paras.length * 0.6; i--) {
    const p = paras[i]!;
    const name = p.startsWith("## ") ? p.slice(3).trim() : null;
    if (name && name.split(" ").length <= 4 && (paras[i + 1] ?? "").startsWith(`${name} is `)) {
      paras = paras.slice(0, i);
    }
  }
  // Sites often style section titles as bold paragraphs: a short title-like
  // line followed by a real paragraph becomes a heading.
  paras = paras.map((p, i) => {
    if (p.startsWith("## ") || p.startsWith("- ")) return p;
    const next = paras[i + 1] ?? "";
    const words = p.split(" ");
    const big = words.filter((w) => /^[A-Za-z]{4,}/.test(w));
    const titleish = big.length > 0 && big.filter((w) => /^[A-Z]/.test(w)).length / big.length >= 0.6;
    if (
      p.length <= 90 &&
      words.length >= 2 &&
      /^[A-Z0-9"]/.test(p) &&
      !/[.?!;,"\u201d)]$/.test(p) &&
      titleish &&
      next.length >= 150 &&
      !next.startsWith("## ")
    ) {
      return `## ${p}`;
    }
    return p;
  });
  // One copy of each heading.
  const seen = new Set<string>();
  paras = paras.filter((p) => {
    if (!p.startsWith("## ")) return true;
    const k = p.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  text = paras.join("\n\n");
  return { text, title };
}

async function pdfToText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  const raw = (Array.isArray(text) ? text.join("\n\n") : text).replace(/\r/g, "");
  // PDFs break lines mid-sentence. Join lines back into paragraphs; keep a break
  // where a line ends a sentence and the next starts a new one, or a blank line.
  return raw
    .replace(/-\n(?=[a-z])/g, "")
    .replace(/([.?!:"\u201d)])\n(?=[A-Z0-9"\u201c(])/g, "$1\n\n")
    .replace(/(?<!\n)\n(?!\n)/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function fileToText(file: { name: string; type: string; bytes: Uint8Array }): Promise<string> {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return pdfToText(file.bytes);
  if (name.endsWith(".docx") || file.type.includes("wordprocessingml")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(file.bytes) });
    return value.trim();
  }
  const raw = new TextDecoder("utf-8").decode(file.bytes);
  if (name.endsWith(".html") || name.endsWith(".htm") || file.type.includes("html")) {
    return htmlToText(raw).text;
  }
  return raw.trim();
}

export async function urlToText(url: string): Promise<{ text: string; title: string | null }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CruxReading/1.0; +https://www.uscethicsbowl.xyz)",
        Accept: "text/html,application/pdf,text/plain;q=0.9,*/*;q=0.5",
      },
    });
    if (!res.ok) throw new Error(`That page answered ${res.status}. If it needs a sign in, download it and upload the file instead.`);
    const type = res.headers.get("content-type") ?? "";
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_IMPORT_BYTES) throw new Error("That file is too large to import (15 MB max).");
    if (type.includes("pdf") || url.toLowerCase().endsWith(".pdf")) {
      return { text: await pdfToText(buf), title: null };
    }
    const raw = new TextDecoder("utf-8").decode(buf);
    return type.includes("html") || /<html/i.test(raw.slice(0, 500)) ? htmlToText(raw) : { text: raw.trim(), title: null };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error("That page took too long to load. Try again or upload the file.");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

// ---------- Passages ----------

export function splitPassages(text: string): { anchor: string; text: string }[] {
  const paras = text.split(/\n{2,}/).map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p.length > 0);
  const out: { anchor: string; text: string }[] = [];
  let cur: string[] = [];
  let words = 0;
  let heading: string | null = null;
  let continued = false;
  const flush = () => {
    if (!cur.length) return;
    const label = heading ? (continued ? `${heading} (cont.)` : heading) : out.length === 0 ? "Opening" : `Part ${out.length + 1}`;
    out.push({ anchor: label.slice(0, 80), text: cur.join("\n\n") });
    cur = [];
    words = 0;
    continued = true;
  };
  for (const p of paras) {
    if (p.startsWith("## ")) {
      // A new section starts a new part, named after it.
      flush();
      heading = p.slice(3).trim();
      continued = false;
      cur.push(p);
      continue;
    }
    const w = p.split(" ").length;
    if (w > 900) {
      // A huge block with no paragraph breaks: cut by sentences.
      flush();
      const sentences = p.split(/(?<=[.!?])\s+/);
      let chunk: string[] = [];
      let cw = 0;
      for (const sn of sentences) {
        chunk.push(sn);
        cw += sn.split(" ").length;
        if (cw >= 140) {
          cur.push(chunk.join(" "));
          words += cw;
          chunk = [];
          cw = 0;
          if (words >= 600) flush();
        }
      }
      if (chunk.length) {
        cur.push(chunk.join(" "));
        words += cw;
      }
      flush();
      continue;
    }
    if (words + w > 650) flush();
    cur.push(p);
    words += w;
  }
  flush();
  return out.slice(0, 600);
}

// ---------- Storage ----------

async function saveDigestRow(row: ReadingDigestRow): Promise<void> {
  if (isSampleDataMode()) {
    await updateStore((store) => {
      const digests = store.case_reading_digests ?? (store.case_reading_digests = []);
      const i = digests.findIndex((d) => d.import_id === row.import_id);
      if (i >= 0) digests[i] = row;
      else digests.push(row);
    });
    return;
  }
  const { error } = await getServiceSupabase()
    .from("case_reading_digests")
    .upsert(row, { onConflict: "import_id" });
  if (error) throw new Error(`saveDigestRow: ${error.message}`);
}

async function savePassages(rows: ReadingPassageRow[]): Promise<void> {
  if (!rows.length) return;
  if (isSampleDataMode()) {
    await updateStore((store) => {
      const passages = store.case_reading_passages ?? (store.case_reading_passages = []);
      const importId = rows[0]!.import_id;
      for (let i = passages.length - 1; i >= 0; i--) {
        if (passages[i]!.import_id === importId) passages.splice(i, 1);
      }
      for (const r of rows) passages.push({ ...r, id: randomUUID() });
    });
    return;
  }
  const sb = getServiceSupabase();
  await sb.from("case_reading_passages").delete().eq("import_id", rows[0]!.import_id);
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from("case_reading_passages").insert(rows.slice(i, i + 200));
    if (error) throw new Error(`savePassages: ${error.message}`);
  }
}

export async function listReadingDigests(opts: {
  teamId: string;
  caseId: string;
}): Promise<(ReadingDigestRow & { title: string })[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const digests = store.case_reading_digests ?? [];
    const imports = store.case_reading_imports ?? [];
    return digests
      .filter((d) => d.team_id === opts.teamId && d.case_id === opts.caseId)
      .map((d) => ({
        ...d,
        title:
          imports.find((i) => i.id === d.import_id)?.title ??
          d.file_name ??
          d.source_url ??
          "Reading",
      }));
  }
  const { data, error } = await getServiceSupabase()
    .from("case_reading_digests")
    .select("*, case_reading_imports(title)")
    .eq("team_id", opts.teamId)
    .eq("case_id", opts.caseId);
  if (error) throw new Error(`listReadingDigests: ${error.message}`);
  return (data ?? []).map((d) => ({
    ...(d as ReadingDigestRow),
    title: ((d as { case_reading_imports?: { title?: string } }).case_reading_imports?.title) ?? "Reading",
  }));
}

/** Keyword search over a team's imported reading for one case. */
export async function searchReadingPassages(opts: {
  teamId: string;
  caseId: string;
  query: string;
  limit?: number;
}): Promise<{ id: string; import_id: string; anchor: string | null; text: string; score: number }[]> {
  const terms = [...new Set(opts.query.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? [])].slice(0, 16);
  if (!terms.length) return [];
  let rows: (ReadingPassageRow & { id: string })[];
  if (isSampleDataMode()) {
    const store = await readStore();
    rows = (store.case_reading_passages ?? []).filter(
      (p) => p.team_id === opts.teamId && p.case_id === opts.caseId,
    );
  } else {
    const { data, error } = await getServiceSupabase()
      .from("case_reading_passages")
      .select("id, import_id, team_id, case_id, ord, anchor, text")
      .eq("team_id", opts.teamId)
      .eq("case_id", opts.caseId)
      .limit(2000);
    if (error) return [];
    rows = (data ?? []) as (ReadingPassageRow & { id: string })[];
  }
  return rows
    .map((r) => {
      const low = r.text.toLowerCase();
      const score = terms.reduce((n, t) => n + (low.includes(t) ? 1 : 0), 0);
      return { id: r.id, import_id: r.import_id, anchor: r.anchor, text: r.text, score };
    })
    .filter((r) => r.score >= Math.min(2, terms.length))
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 5);
}

// ---------- Digest ----------

/** Trim to max without cutting a word: back to the last sentence end, else the last space. */
function clipText(v: string, max: number): string {
  const t = v.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  if (end > max * 0.6) return cut.slice(0, end + 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "")}...`;
}

const s = (max: number) =>
  z.preprocess((v) => (typeof v === "string" ? clipText(v, max) : v), z.string());

const digestSchema = z.object({
  summary: s(1000).catch(""),
  key_points: z
    .array(z.object({ point: s(300), quote: s(220).nullable().catch(null).default(null) }).passthrough())
    .max(10)
    .catch([])
    .default([]),
  ideas: z
    .array(z.object({ use: s(60).catch("support"), text: s(400) }).passthrough())
    .max(8)
    .catch([])
    .default([]),
  questions: z.array(s(240)).max(5).catch([]).default([]),
  relevance: s(800).catch(""),
});

export async function digestText(opts: {
  caseId: string;
  title: string;
  text: string;
  /** Null for scheduled jobs with no person behind them. */
  personId: string | null;
}): Promise<ReadingDigest | null> {
  const cases = await listCases();
  const c = cases.find((x) => x.id === opts.caseId);
  // Long readings: the opening, a middle slice and the end carry most of the argument.
  const t = opts.text;
  const sample =
    t.length <= 24_000
      ? t
      : `${t.slice(0, 14_000)}\n\n[...]\n\n${t.slice(Math.floor(t.length / 2) - 4_000, Math.floor(t.length / 2) + 4_000)}\n\n[...]\n\n${t.slice(-6_000)}`;
  const result = await runAgent({
    agent: "librarian",
    feature: "reading_import_digest",
    tier: "small",
    system: [
      sharedSystemPrefix(),
      "",
      "Task: a team imported this reading for an Ethics Bowl case. Digest it so the team, and Cruxy later, can use it fast.",
      "summary: three or four plain sentences on what it argues or reports.",
      "key_points: up to 8, each a plain point plus a short exact quote from the text (under 25 words) that backs it, or null.",
      "ideas: up to 6 things the team could use, each with use set to one of support, objection, reply, stakeholder, framework, example, fact, and the idea written for this case.",
      "questions: up to 4 questions a judge might ask the team after reading this.",
      "relevance: one or two sentences on how it bears on the case question, including if it cuts against the obvious answer.",
      "Only use what the text says. Plain words. No em dashes.",
      'Return JSON only: {"summary","key_points":[{"point","quote"}],"ideas":[{"use","text"}],"questions":[],"relevance"}',
    ].join("\n"),
    user: `Case ${c?.number ?? ""}: ${c?.title ?? ""}\nCase crux: ${c?.crux ?? ""}\n\nReading: ${opts.title}\n\n${sample}`,
    schema: digestSchema,
    personId: opts.personId,
    estimatedCostUsd: 0.02,
  });
  if (!result.ok || result.stub) return null;
  return result.data as ReadingDigest;
}

const bookmarkSchema = z.object({
  bookmarks: z
    .array(z.object({ ord: z.coerce.number().int(), why: s(220).catch("") }).passthrough())
    .max(8)
    .catch([])
    .default([]),
});

/**
 * Mark the parts of a reading that matter most for this case, with one line
 * on why, so a long book or article can be read where it counts.
 */
export async function bookmarkPassages(opts: {
  caseId: string;
  title: string;
  passages: { ord: number; anchor: string | null; text: string }[];
  personId: string | null;
}): Promise<{ ord: number; why: string }[]> {
  if (opts.passages.length < 2) return [];
  const cases = await listCases();
  const c = cases.find((x) => x.id === opts.caseId);
  // A preview of every part, within a budget: long books get shorter previews.
  const per = Math.max(160, Math.min(500, Math.floor(60_000 / opts.passages.length)));
  const listing = opts.passages
    .slice(0, 400)
    .map((p) => `[${p.ord}] ${p.anchor ? `${p.anchor}: ` : ""}${p.text.replace(/\s+/g, " ").slice(0, per)}`)
    .join("\n");
  const result = await runAgent({
    agent: "librarian",
    feature: "reading_bookmarks",
    tier: "small",
    system: [
      sharedSystemPrefix(),
      "",
      "Task: bookmark the parts of this reading an Ethics Bowl team should read first for this case.",
      "Pick 3 to 8 parts by their [number]. Prefer parts that state an argument, a principle, a key fact or a strong objection bearing on the case question, over introductions, summaries of other work, or acknowledgements.",
      "why: one plain sentence on what that part gives the team for this case.",
      "Plain words. No em dashes.",
      'Return JSON only: {"bookmarks":[{"ord":3,"why":"..."}]}',
    ].join("\n"),
    user: `Case ${c?.number ?? ""}: ${c?.title ?? ""}\nCase crux: ${c?.crux ?? ""}\n\nReading: ${opts.title}\n\nParts:\n${listing}`,
    schema: bookmarkSchema,
    personId: opts.personId,
    estimatedCostUsd: 0.01,
  }).catch(() => null);
  if (!result || !result.ok || result.stub) return [];
  const valid = new Set(opts.passages.map((p) => p.ord));
  const seen = new Set<number>();
  return result.data.bookmarks
    .filter((b) => valid.has(b.ord) && !seen.has(b.ord) && seen.add(b.ord))
    .map((b) => ({ ord: b.ord, why: b.why }))
    .sort((a, b) => a.ord - b.ord);
}

/** Pull the text out of a file, a link or pasted text. */
export async function extractReadingText(opts: {
  title?: string | null;
  text?: string | null;
  url?: string | null;
  file?: { name: string; type: string; bytes: Uint8Array } | null;
}): Promise<{ text: string; title: string }> {
  let text = (opts.text ?? "").trim();
  let guessedTitle: string | null = null;
  if (opts.file) {
    if (opts.file.bytes.byteLength > MAX_IMPORT_BYTES) throw new Error("That file is too large to import (15 MB max).");
    text = await fileToText(opts.file);
    guessedTitle = opts.file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ");
  } else if (opts.url) {
    if (!/^https?:\/\//i.test(opts.url)) throw new Error("Paste a full link starting with http.");
    const got = await urlToText(opts.url);
    text = got.text;
    guessedTitle = got.title;
  }
  text = text.replace(/[·—–]/g, ",").slice(0, MAX_CHARS);
  if (text.length < 80) {
    throw new Error(
      opts.file
        ? "Cruxy could not read text from that file. If it is a scan, paste the text instead."
        : opts.url
          ? "Cruxy could not read that page. Download it and upload the file, or paste the text."
          : "Paste a bit more text so Cruxy has something to digest.",
    );
  }
  const title = (opts.title?.trim() || guessedTitle || text.split("\n")[0]!.slice(0, 90)).slice(0, 200);
  return { text, title };
}

/** Store an extracted reading for one team, with a digest made once. */
async function storeReadingForTeam(opts: {
  caseId: string;
  teamId: string;
  personId: string;
  title: string;
  note: string;
  text: string;
  url: string | null;
  fileName: string | null;
  digest: ReadingDigest | null;
  via: "file" | "link" | "paste";
  action: string;
}): Promise<{ importId: string; status: ReadingDigestRow["status"]; chars: number }> {
  const row = await addExtraReading({
    caseId: opts.caseId,
    teamId: opts.teamId,
    personId: opts.personId,
    title: opts.title,
    body: opts.note.slice(0, 2000),
    kind: "material",
  });
  const base: ReadingDigestRow = {
    import_id: row.id,
    team_id: opts.teamId,
    case_id: opts.caseId,
    source_url: opts.url,
    file_name: opts.fileName,
    chars: opts.text.length,
    status: "pending",
    digest: null,
    error: null,
    digested_at: null,
  };
  await saveDigestRow(base);
  const parts = splitPassages(opts.text);
  await savePassages(
    parts.map((p, i) => ({
      import_id: row.id,
      team_id: opts.teamId,
      case_id: opts.caseId,
      ord: i,
      anchor: p.anchor,
      text: p.text,
    })),
  );
  const bookmarks = opts.digest
    ? await bookmarkPassages({
        caseId: opts.caseId,
        title: opts.title,
        passages: parts.map((p, i) => ({ ord: i, anchor: p.anchor, text: p.text })),
        personId: opts.personId,
      }).catch(() => [])
    : [];
  const done: ReadingDigestRow = opts.digest
    ? { ...base, status: "done", digest: { ...opts.digest, bookmarks }, digested_at: nowIso() }
    : { ...base, status: "failed", error: "Cruxy could not digest it just now. The text is saved and searchable." };
  await saveDigestRow(done);
  await logActivity({
    person_id: opts.personId,
    action: opts.action,
    target: row.id,
    meta: { caseId: opts.caseId, teamId: opts.teamId, chars: opts.text.length, via: opts.via, digested: Boolean(opts.digest) },
  });
  return { importId: row.id, status: done.status, chars: opts.text.length };
}

/** Import one reading into a case for a team, then digest it. */
export async function importReading(opts: {
  caseId: string;
  teamId: string;
  personId: string;
  title?: string | null;
  note?: string | null;
  text?: string | null;
  url?: string | null;
  file?: { name: string; type: string; bytes: Uint8Array } | null;
}): Promise<{ importId: string; status: ReadingDigestRow["status"]; chars: number }> {
  const { text, title } = await extractReadingText(opts);
  const digest = await digestText({ caseId: opts.caseId, title, text, personId: opts.personId }).catch(() => null);
  return storeReadingForTeam({
    caseId: opts.caseId,
    teamId: opts.teamId,
    personId: opts.personId,
    title,
    note: opts.note?.trim() ?? "",
    text,
    url: opts.url ?? null,
    fileName: opts.file?.name ?? null,
    digest,
    via: opts.file ? "file" : opts.url ? "link" : "paste",
    action: "case_reading_imported",
  });
}

/** Dr. B sends one reading to several teams: read and digest once, store per team. */
export async function disseminateReading(opts: {
  caseId: string;
  teamIds: string[];
  personId: string;
  title?: string | null;
  note?: string | null;
  text?: string | null;
  url?: string | null;
  file?: { name: string; type: string; bytes: Uint8Array } | null;
}): Promise<{ teamId: string; importId: string; status: ReadingDigestRow["status"] }[]> {
  const { text, title } = await extractReadingText(opts);
  const digest = await digestText({ caseId: opts.caseId, title, text, personId: opts.personId }).catch(() => null);
  const out: { teamId: string; importId: string; status: ReadingDigestRow["status"] }[] = [];
  for (const teamId of opts.teamIds) {
    const r = await storeReadingForTeam({
      caseId: opts.caseId,
      teamId,
      personId: opts.personId,
      title,
      note: (opts.note?.trim() || "Shared by Dr. B.").trim(),
      text,
      url: opts.url ?? null,
      fileName: opts.file?.name ?? null,
      digest,
      via: opts.file ? "file" : opts.url ? "link" : "paste",
      action: "case_reading_disseminated",
    });
    out.push({ teamId, importId: r.importId, status: r.status });
  }
  return out;
}

/** The full text of one import, in order, for the reading room. */
export async function listReadingPassages(opts: {
  importId: string;
  teamId: string;
}): Promise<{ ord: number; anchor: string | null; text: string }[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return (store.case_reading_passages ?? [])
      .filter((p) => p.import_id === opts.importId && p.team_id === opts.teamId)
      .sort((a, b) => a.ord - b.ord)
      .map(({ ord, anchor, text }) => ({ ord, anchor, text }));
  }
  const { data, error } = await getServiceSupabase()
    .from("case_reading_passages")
    .select("ord, anchor, text")
    .eq("import_id", opts.importId)
    .eq("team_id", opts.teamId)
    .order("ord");
  if (error) throw new Error(`listReadingPassages: ${error.message}`);
  return data ?? [];
}
