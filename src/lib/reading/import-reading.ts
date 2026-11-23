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

type PassageRow = {
  import_id: string;
  team_id: string;
  case_id: string;
  ord: number;
  anchor: string | null;
  text: string;
};

const sampleDigests: ReadingDigestRow[] = [];
const samplePassages: (PassageRow & { id: string })[] = [];

// ---------- Text extraction ----------

function htmlToText(html: string): { text: string; title: string | null } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
  const body = html
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|section|article|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
  return { text: body, title };
}

async function pdfToText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join("\n\n") : text).trim();
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
  const flush = () => {
    if (!cur.length) return;
    out.push({ anchor: `Part ${out.length + 1}`, text: cur.join("\n\n") });
    cur = [];
    words = 0;
  };
  for (const p of paras) {
    const w = p.split(" ").length;
    if (w > 900) {
      // A huge block with no paragraph breaks: cut by sentences.
      flush();
      const sentences = p.split(/(?<=[.!?])\s+/);
      for (const s of sentences) {
        cur.push(s);
        words += s.split(" ").length;
        if (words >= 600) flush();
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
    const i = sampleDigests.findIndex((d) => d.import_id === row.import_id);
    if (i >= 0) sampleDigests[i] = row;
    else sampleDigests.push(row);
    return;
  }
  const { error } = await getServiceSupabase()
    .from("case_reading_digests")
    .upsert(row, { onConflict: "import_id" });
  if (error) throw new Error(`saveDigestRow: ${error.message}`);
}

async function savePassages(rows: PassageRow[]): Promise<void> {
  if (!rows.length) return;
  if (isSampleDataMode()) {
    for (const r of rows) samplePassages.push({ ...r, id: randomUUID() });
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
    const { readStore } = await import("@/lib/db/sample-store");
    const store = (await readStore()) as { case_reading_imports?: { id: string; title: string }[] };
    return sampleDigests
      .filter((d) => d.team_id === opts.teamId && d.case_id === opts.caseId)
      .map((d) => ({
        ...d,
        title: store.case_reading_imports?.find((i) => i.id === d.import_id)?.title ?? d.file_name ?? d.source_url ?? "Reading",
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
  let rows: (PassageRow & { id: string })[];
  if (isSampleDataMode()) {
    rows = samplePassages.filter((p) => p.team_id === opts.teamId && p.case_id === opts.caseId);
  } else {
    const { data, error } = await getServiceSupabase()
      .from("case_reading_passages")
      .select("id, import_id, team_id, case_id, ord, anchor, text")
      .eq("team_id", opts.teamId)
      .eq("case_id", opts.caseId)
      .limit(2000);
    if (error) return [];
    rows = (data ?? []) as (PassageRow & { id: string })[];
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

const s = (max: number) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim().slice(0, max) : v), z.string());

const digestSchema = z.object({
  summary: s(700).catch(""),
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
  relevance: s(400).catch(""),
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
  await savePassages(
    splitPassages(opts.text).map((p, i) => ({
      import_id: row.id,
      team_id: opts.teamId,
      case_id: opts.caseId,
      ord: i,
      anchor: p.anchor,
      text: p.text,
    })),
  );
  const done: ReadingDigestRow = opts.digest
    ? { ...base, status: "done", digest: opts.digest, digested_at: nowIso() }
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
    return samplePassages
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
