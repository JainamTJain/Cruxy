/**
 * The reading room: every reading for a case (web readings Cruxy found and the
 * team's own imports) opens inside Crux, with the team's highlights, comments
 * and sticky notes kept beside it. Cruxy reads those notes when it critiques
 * the working document, so they come back as suggestions in one place.
 */
import "server-only";

import { isSampleDataMode } from "@/lib/db/config";
import { logActivity } from "@/lib/db/repository";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import {
  digestText,
  listReadingDigests,
  listReadingPassages,
  splitPassages,
  urlToText,
  type ReadingDigest,
} from "@/lib/reading/import-reading";
import { listOpenReadings } from "@/lib/reading/open-reading";
import { randomUUID } from "crypto";
import { nowIso } from "@/lib/utils";

export type ReadingKind = "web" | "import";

export type ReadingAnnotation = {
  id: string;
  team_id: string;
  case_id: string;
  reading_kind: ReadingKind;
  reading_id: string;
  passage_ord: number | null;
  kind: "highlight" | "comment" | "note";
  quote: string | null;
  body: string | null;
  person_id: string | null;
  created_at: string;
};

export type ReadingView = {
  kind: ReadingKind;
  id: string;
  caseId: string;
  title: string;
  sourceUrl: string | null;
  byline: string | null;
  why: string | null;
  passages: { ord: number; anchor: string | null; text: string }[];
  digest: ReadingDigest | null;
  textStatus: "none" | "done" | "failed";
  textError: string | null;
};

type OpenReadingTextRow = {
  id: string;
  case_id: string;
  url: string;
  title: string;
  text_status?: "none" | "done" | "failed";
};

/** Fetch, split and digest a web reading the first time someone opens it. */
export async function ensureWebText(
  row: OpenReadingTextRow,
  personId: string | null,
): Promise<{ status: "done" | "failed"; error: string | null }> {
  try {
    const got = await urlToText(row.url);
    const text = got.text.replace(/[·—–]/g, ",").slice(0, 400_000);
    if (text.length < 200) throw new Error("This page has too little readable text here. Open the original.");
    const parts = splitPassages(text).map((p, i) => ({ ord: i, anchor: p.anchor, text: p.text }));
    const digest = await digestText({
      caseId: row.case_id,
      title: row.title,
      text,
      personId,
    }).catch(() => null);
    if (isSampleDataMode()) {
      await updateStore((store) => {
        const passages =
          store.case_open_reading_passages ?? (store.case_open_reading_passages = []);
        for (let i = passages.length - 1; i >= 0; i--) {
          if (passages[i]!.open_reading_id === row.id) passages.splice(i, 1);
        }
        for (const p of parts) {
          passages.push({ open_reading_id: row.id, ord: p.ord, anchor: p.anchor, text: p.text });
        }
        const digests =
          store.case_open_reading_digests ?? (store.case_open_reading_digests = []);
        const di = digests.findIndex((d) => d.open_reading_id === row.id);
        const entry = { open_reading_id: row.id, digest };
        if (di >= 0) digests[di] = entry;
        else digests.push(entry);
      });
    } else {
      const sb = getServiceSupabase();
      await sb.from("case_open_reading_passages").delete().eq("open_reading_id", row.id);
      for (let i = 0; i < parts.length; i += 200) {
        const { error } = await sb
          .from("case_open_reading_passages")
          .insert(parts.slice(i, i + 200).map((p) => ({ ...p, open_reading_id: row.id })));
        if (error) throw new Error(error.message);
      }
      await sb
        .from("case_open_readings")
        .update({ text_status: "done", text_error: null, digest })
        .eq("id", row.id);
    }
    return { status: "done", error: null };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Could not load this page.";
    if (!isSampleDataMode()) {
      await getServiceSupabase()
        .from("case_open_readings")
        .update({ text_status: "failed", text_error: error.slice(0, 300) })
        .eq("id", row.id);
    }
    return { status: "failed", error };
  }
}

/** Rows still waiting for fetch/split/digest (first open would do this on demand). */
export async function listOpenReadingsNeedingText(opts?: {
  caseId?: string;
  limit?: number;
}): Promise<OpenReadingTextRow[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 12, 1), 40);
  if (isSampleDataMode()) {
    if (!opts?.caseId) return [];
    const [rows, store] = await Promise.all([listOpenReadings(opts.caseId), readStore()]);
    const prepared = new Set((store.case_open_reading_passages ?? []).map((p) => p.open_reading_id));
    return rows
      .filter((r) => !prepared.has(r.id))
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        case_id: r.case_id,
        url: r.url,
        title: r.title,
        text_status: "none" as const,
      }));
  }
  let q = getServiceSupabase()
    .from("case_open_readings")
    .select("id, case_id, url, title, text_status")
    .eq("status", "active")
    .eq("text_status", "none")
    .order("found_at", { ascending: true })
    .limit(limit);
  if (opts?.caseId) q = q.eq("case_id", opts.caseId);
  const { data, error } = await q;
  if (error) throw new Error(`listOpenReadingsNeedingText: ${error.message}`);
  return (data ?? []) as OpenReadingTextRow[];
}

/**
 * Prewarm web reading text so the first open is fast. Caps how many rows run
 * and stops before maxDuration so the cron or admin call can finish cleanly.
 * Failures are skipped; the next run retries them while text_status stays none
 * only on hard crashes (ensureWebText marks failed when it can).
 */
export async function prewarmOpenReadingTexts(opts: {
  caseId?: string;
  personId: string | null;
  /** Max readings to prepare in this call. */
  limit?: number;
  /** Stop starting new work after this many ms (default 240s). */
  budgetMs?: number;
}): Promise<{ attempted: number; done: number; failed: number; skipped: number }> {
  const limit = opts.limit ?? 8;
  const budgetMs = opts.budgetMs ?? 240_000;
  const started = Date.now();
  const rows = await listOpenReadingsNeedingText({ caseId: opts.caseId, limit });
  let done = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of rows) {
    if (Date.now() - started > budgetMs) {
      skipped += rows.length - done - failed;
      break;
    }
    try {
      const r = await ensureWebText(row, opts.personId);
      if (r.status === "done") done += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }
  if (done + failed > 0) {
    await logActivity({
      person_id: opts.personId,
      action: "open_reading_text_prewarmed",
      target: opts.caseId ?? "all",
      meta: { attempted: done + failed, done, failed, skipped },
    });
  }
  return { attempted: done + failed, done, failed, skipped };
}

export async function loadReading(opts: {
  kind: ReadingKind;
  id: string;
  caseId: string;
  teamId: string;
  personId: string;
}): Promise<ReadingView | null> {
  if (opts.kind === "web") {
    if (isSampleDataMode()) {
      const row = (await listOpenReadings(opts.caseId)).find((r) => r.id === opts.id);
      if (!row) return null;
      let store = await readStore();
      const hasPassages = (store.case_open_reading_passages ?? []).some(
        (p) => p.open_reading_id === row.id,
      );
      if (!hasPassages) await ensureWebText(row, opts.personId);
      store = await readStore();
      const passages = (store.case_open_reading_passages ?? [])
        .filter((p) => p.open_reading_id === row.id)
        .sort((a, b) => a.ord - b.ord)
        .map(({ ord, anchor, text }) => ({ ord, anchor, text }));
      const digest =
        store.case_open_reading_digests?.find((d) => d.open_reading_id === row.id)
          ?.digest ?? null;
      return {
        kind: "web",
        id: row.id,
        caseId: row.case_id,
        title: row.title,
        sourceUrl: row.url,
        byline: [row.authors, row.year].filter(Boolean).join(", ") || null,
        why: row.why,
        passages,
        digest,
        textStatus: passages.length ? "done" : "failed",
        textError: null,
      };
    }
    const sb = getServiceSupabase();
    const { data: row } = await sb.from("case_open_readings").select("*").eq("id", opts.id).maybeSingle();
    if (!row || row.case_id !== opts.caseId) return null;
    let status = row.text_status as "none" | "done" | "failed";
    let error = (row.text_error as string | null) ?? null;
    if (status === "none") {
      const r = await ensureWebText(row, opts.personId);
      status = r.status;
      error = r.error;
    }
    const { data: passages } = await sb
      .from("case_open_reading_passages")
      .select("ord, anchor, text")
      .eq("open_reading_id", row.id)
      .order("ord");
    const { data: fresh } = await sb.from("case_open_readings").select("digest").eq("id", row.id).maybeSingle();
    return {
      kind: "web",
      id: row.id,
      caseId: row.case_id,
      title: row.title,
      sourceUrl: row.url,
      byline: [row.authors, row.year].filter(Boolean).join(", ") || null,
      why: row.why,
      passages: passages ?? [],
      digest: (fresh?.digest as ReadingDigest | null) ?? null,
      textStatus: status,
      textError: error,
    };
  }

  // A team's own import: only that team can open it.
  const digests = await listReadingDigests({ teamId: opts.teamId, caseId: opts.caseId });
  const d = digests.find((x) => x.import_id === opts.id);
  if (!d) return null;
  const passages = await listReadingPassages({ importId: opts.id, teamId: opts.teamId });
  return {
    kind: "import",
    id: opts.id,
    caseId: opts.caseId,
    title: d.title,
    sourceUrl: d.source_url,
    byline: d.file_name,
    why: d.digest?.relevance ?? null,
    passages,
    digest: d.digest,
    textStatus: passages.length ? "done" : "failed",
    textError: passages.length ? null : d.error,
  };
}

export async function listAnnotations(opts: {
  teamId: string;
  caseId: string;
  kind?: ReadingKind;
  readingId?: string;
}): Promise<ReadingAnnotation[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return (store.reading_annotations ?? []).filter(
      (a) =>
        a.team_id === opts.teamId &&
        a.case_id === opts.caseId &&
        (!opts.kind || a.reading_kind === opts.kind) &&
        (!opts.readingId || a.reading_id === opts.readingId),
    );
  }
  let q = getServiceSupabase()
    .from("reading_annotations")
    .select("*")
    .eq("team_id", opts.teamId)
    .eq("case_id", opts.caseId)
    .order("created_at", { ascending: true });
  if (opts.kind) q = q.eq("reading_kind", opts.kind);
  if (opts.readingId) q = q.eq("reading_id", opts.readingId);
  const { data, error } = await q;
  if (error) throw new Error(`listAnnotations: ${error.message}`);
  return (data ?? []) as ReadingAnnotation[];
}

export async function addAnnotation(input: Omit<ReadingAnnotation, "id" | "created_at">): Promise<ReadingAnnotation> {
  const clean = (s: string | null) => (s ? s.replace(/[·—–]/g, ",").trim().slice(0, 4000) : null);
  const row: ReadingAnnotation = {
    ...input,
    quote: clean(input.quote),
    body: clean(input.body),
    id: randomUUID(),
    created_at: nowIso(),
  };
  if (isSampleDataMode()) {
    await updateStore((store) => {
      const anns = store.reading_annotations ?? (store.reading_annotations = []);
      anns.push(row);
    });
  } else {
    const { error } = await getServiceSupabase().from("reading_annotations").insert(row);
    if (error) throw new Error(`addAnnotation: ${error.message}`);
  }
  await logActivity({
    person_id: input.person_id,
    action: `reading_${input.kind}_added`,
    target: row.id,
    meta: { caseId: input.case_id, readingKind: input.reading_kind, readingId: input.reading_id },
  });
  return row;
}

export async function deleteAnnotation(opts: { id: string; teamId: string; personId: string }): Promise<void> {
  if (isSampleDataMode()) {
    await updateStore((store) => {
      const anns = store.reading_annotations ?? (store.reading_annotations = []);
      const i = anns.findIndex((a) => a.id === opts.id && a.team_id === opts.teamId);
      if (i >= 0) anns.splice(i, 1);
    });
  } else {
    const { error } = await getServiceSupabase()
      .from("reading_annotations")
      .delete()
      .eq("id", opts.id)
      .eq("team_id", opts.teamId);
    if (error) throw new Error(`deleteAnnotation: ${error.message}`);
  }
  await logActivity({ person_id: opts.personId, action: "reading_annotation_removed", target: opts.id, meta: {} });
}

/**
 * Everything the team has read and noted for a case, compacted for Cruxy:
 * import digests and their highlights, comments and sticky notes.
 */
export async function readingNotesForCruxy(opts: {
  teamId: string;
  caseId: string;
}): Promise<{ id: string; label: string; text: string }[]> {
  const [annotations, digests, web] = await Promise.all([
    listAnnotations({ teamId: opts.teamId, caseId: opts.caseId }).catch(() => []),
    listReadingDigests({ teamId: opts.teamId, caseId: opts.caseId }).catch(() => []),
    listOpenReadings(opts.caseId).catch(() => []),
  ]);
  const titleOf = (a: ReadingAnnotation) =>
    a.reading_kind === "web"
      ? web.find((w) => w.id === a.reading_id)?.title ?? "a reading"
      : digests.find((d) => d.import_id === a.reading_id)?.title ?? "an imported reading";
  const out: { id: string; label: string; text: string }[] = [];
  for (const a of annotations.slice(-40)) {
    const what = a.kind === "note" ? "Your note" : a.kind === "comment" ? "Your comment" : "You highlighted";
    const text = [a.quote ? `"${a.quote.slice(0, 400)}"` : "", a.body ? a.body.slice(0, 600) : ""].filter(Boolean).join(": ");
    if (text) out.push({ id: `note:${a.id}`, label: `${what} on ${titleOf(a)}`, text });
  }
  for (const d of digests.filter((x) => x.digest).slice(0, 8)) {
    out.push({
      id: `reading:${d.import_id}`,
      label: `Your reading: ${d.title}`,
      text: [d.digest!.summary, ...d.digest!.ideas.map((i) => `${i.use}: ${i.text}`)].join(" ").slice(0, 900),
    });
  }
  return out;
}
