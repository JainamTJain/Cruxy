/**
 * Open reading from the web, per case.
 *
 * Cruxy searches open scholarship and the web for material that helps the
 * teams understand a case more deeply: encyclopedia entries, open-access
 * papers, reports, court decisions and serious journalism. What is free to
 * read is listed under Extra reading for every team. What is worth having but
 * not free (books, paywalled papers) becomes a material request in the tech
 * admin console, with why it matters and which chapter.
 */
import "server-only";

import { randomUUID } from "crypto";
import { z } from "zod";
import { buildTruthSource } from "@/lib/critique/truth-source";
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { sharedSystemPrefix } from "@/lib/cruxy/prompts/shared";
import { searchOpenLiterature } from "@/lib/cruxy/literature/search";
import { isSampleDataMode } from "@/lib/db/config";
import { listBookRequests, saveBookRequest } from "@/lib/db/library-repository";
import { logActivity } from "@/lib/db/repository";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { nowIso } from "@/lib/utils";

export type OpenReadingKind = "encyclopedia" | "paper" | "report" | "court" | "news" | "book" | "other";

export type OpenReading = {
  id: string;
  case_id: string;
  title: string;
  url: string;
  source_kind: OpenReadingKind;
  why: string | null;
  authors: string | null;
  year: number | null;
  found_at: string;
};

const KINDS = ["encyclopedia", "paper", "report", "court", "news", "book", "other"] as const;
const sampleRows: OpenReading[] = [];

const s = (max: number) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim().slice(0, max) : v), z.string());

const finderSchema = z.object({
  open: z
    .array(
      z.object({
        title: s(240).pipe(z.string().min(3)),
        url: s(600).pipe(z.string().regex(/^https?:\/\//)),
        kind: z.preprocess((v) => (typeof v === "string" ? v.toLowerCase() : v), z.enum(KINDS)).catch("other"),
        why: s(300).catch(""),
        authors: s(200).nullable().catch(null).default(null),
        year: z.preprocess((v) => (typeof v === "string" ? Number.parseInt(v, 10) : v), z.number().int().nullable()).catch(null).default(null),
      }).passthrough(),
    )
    .catch([])
    .default([]),
  requests: z
    .array(
      z.object({
        title: s(240).pipe(z.string().min(3)),
        why: s(300).catch(""),
        chapter: s(160).nullable().catch(null).default(null),
      }).passthrough(),
    )
    .catch([])
    .default([]),
});

export async function listOpenReadings(
  caseId: string,
  opts?: { hideUploads?: boolean },
): Promise<OpenReading[]> {
  const keep = (r: OpenReading) => !(opts?.hideUploads && r.url.startsWith("upload:"));
  if (isSampleDataMode()) return sampleRows.filter((r) => r.case_id === caseId).filter(keep);
  const { data, error } = await getServiceSupabase()
    .from("case_open_readings")
    .select("id, case_id, title, url, source_kind, why, authors, year, found_at")
    .eq("case_id", caseId)
    .eq("status", "active")
    .order("found_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(`listOpenReadings: ${error.message}`);
  // Uploaded books first: they were asked for because the open web lacked them.
  const rows = ((data ?? []) as OpenReading[]).filter(keep);
  return [...rows.filter((r) => r.url.startsWith("upload:")), ...rows.filter((r) => !r.url.startsWith("upload:"))];
}

/**
 * Wave 7: closed books must not join Deeper reading with full text.
 * Kept as a stub so callers fail closed instead of publishing the PDF text.
 */
export async function addBookReading(_opts: {
  caseId: string;
  bookId: string;
  title: string;
  why: string | null;
}): Promise<OpenReading> {
  throw new Error(
    "Uploaded books stay with the tech admin. They are not added to Deeper reading.",
  );
}

async function saveOpenReadings(rows: Omit<OpenReading, "id" | "found_at">[]): Promise<number> {
  if (!rows.length) return 0;
  if (isSampleDataMode()) {
    let n = 0;
    for (const r of rows) {
      if (sampleRows.some((x) => x.case_id === r.case_id && x.url === r.url)) continue;
      sampleRows.push({ ...r, id: randomUUID(), found_at: nowIso() });
      n += 1;
    }
    return n;
  }
  const { data, error } = await getServiceSupabase()
    .from("case_open_readings")
    .upsert(rows, { onConflict: "case_id,url", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`saveOpenReadings: ${error.message}`);
  return (data ?? []).length;
}

/** Find open material for one case and file requests for what is not open. */
export async function findOpenReadingForCase(opts: {
  caseId: string;
  personId: string | null;
}): Promise<{ added: number; requested: number; note: string }> {
  const truth = await buildTruthSource(opts.caseId);
  const caseText = truth.items
    .filter((t) => t.kind === "case_set" || t.kind === "domain_prep")
    .slice(0, 6)
    .map((t) => `${t.label}: ${t.text.slice(0, 700)}`)
    .join("\n");
  const title = truth.caseTitle ?? "";
  const words = (x: string) =>
    x.replace(/[^\w\s'-]/g, " ").split(/\s+/).filter((w) => w.length > 3).slice(0, 12).join(" ");
  const queries = [title, words(caseText.slice(0, 400))].filter((q) => q.trim().length > 3);
  const lit = (
    await Promise.all(queries.map((q) => searchOpenLiterature(q, { limit: 8 }).catch(() => [])))
  ).flat();
  const litBrief = lit
    .slice(0, 14)
    .map(
      (h, i) =>
        `[L${i + 1}] ${h.citation} | open=${h.open_access ? "yes" : "no"}${h.oa_url ?? h.url ? ` | <${h.oa_url ?? h.url}>` : ""}${h.abstract ? `\n   ${h.abstract.slice(0, 260)}` : ""}`,
    )
    .join("\n");
  const existing = await listOpenReadings(opts.caseId).catch(() => []);

  const result = await runAgent({
    agent: "researcher",
    feature: "open_reading_finder",
    tier: "strong",
    webSearch: true,
    system: [
      sharedSystemPrefix(),
      "",
      "Task: build a short reading list that helps Ethics Bowl students understand this case more deeply than the case text alone.",
      "Use web search and the open scholarship list. Aim for variety and quality: the Stanford or Internet Encyclopedia of Philosophy entries on the core moral questions, two or three open-access papers that argue opposite sides, a primary source (a law, policy, court decision, official report or dataset) behind the case facts, and one or two serious pieces of journalism or analysis on the real events.",
      "open: up to 10 items that anyone can read in full for free, each with the exact URL you found (never guess a URL), kind (encyclopedia, paper, report, court, news, book, other), one line on why it matters for this case, authors and year when known. Skip anything already listed.",
      "requests: up to 4 important works that are NOT free to read (books, paywalled papers) that the team should get, each with why it matters and the most useful chapter or section.",
      "Even-handed: include the strongest material on each side. Plain words. No em dashes.",
      'Return JSON only: {"open":[{"title","url","kind","why","authors","year"}],"requests":[{"title","why","chapter"}]}',
    ].join("\n"),
    user: [
      `Case: ${title}`,
      caseText || "(case text unavailable)",
      "",
      "Open scholarship found:",
      litBrief || "(none)",
      "",
      "Already on the list:",
      existing.map((e) => `- ${e.title} <${e.url}>`).join("\n") || "(nothing yet)",
    ].join("\n"),
    schema: finderSchema,
    personId: opts.personId,
    estimatedCostUsd: 0.15,
  });
  if (!result.ok || result.stub) {
    return { added: 0, requested: 0, note: result.ok ? "Cruxy is offline" : result.reason };
  }

  // Keep only URLs Cruxy actually saw: from the literature list, or a real web URL.
  const known = new Set(lit.flatMap((h) => [h.url, h.oa_url].filter(Boolean) as string[]));
  const rows = result.data.open
    .filter((o) => !existing.some((e) => e.url === o.url))
    .filter((o) => known.has(o.url) || /^https:\/\/[^/]+\.[^/]+\//.test(o.url))
    .slice(0, 10)
    .map((o) => ({
      case_id: opts.caseId,
      title: o.title,
      url: o.url,
      source_kind: o.kind,
      why: o.why || null,
      authors: o.authors ?? null,
      year: o.year ?? null,
    }));
  const added = await saveOpenReadings(rows);

  const existingRequests = await listBookRequests().catch(() => []);
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  let requested = 0;
  for (const r of result.data.requests.slice(0, 4)) {
    if (existingRequests.some((b) => norm(b.title) === norm(r.title))) continue;
    await saveBookRequest({
      id: randomUUID(),
      title: r.title,
      reason: `For ${title}: ${r.why}`.slice(0, 500),
      chapter: r.chapter,
      case_id: opts.caseId,
      status: "open",
      created_at: nowIso(),
      created_by: null,
    });
    requested += 1;
  }
  await logActivity({
    person_id: opts.personId,
    action: "open_reading_found",
    target: opts.caseId,
    meta: { added, requested },
  });
  return { added, requested, note: `model=${result.data.open.length}/${result.data.requests.length}` };
}
