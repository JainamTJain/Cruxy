import "server-only";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore } from "@/lib/db/sample-store";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import { logActivity } from "@/lib/db/supabase/foundation";

/**
 * Workstream K extras: data-model audit helpers and stack catalogs.
 * Do not edit existing repository / supabase/*.ts functions — add here.
 * Migration: 00019_workstream_k_data_model_hardening.sql
 */

/** Spec Data model tables (F-306–F-332), plus closely related Track 0 companions. */
export const DATA_MODEL_TABLES = [
  "people",
  "teams",
  "team_memberships",
  "auth_codes",
  "competitions",
  "cases",
  "files",
  "passages",
  "highlights",
  "comments",
  "claims",
  "supports",
  "backings",
  "counterclaims",
  "truth_items",
  "proposals",
  "decisions",
  "case_roles",
  "assignments",
  "one_pagers",
  "flashcards",
  "card_reviews",
  "questions",
  "answers",
  "sessions",
  "rounds",
  "attendance",
  "recordings",
  "transcript_lines",
  "judges",
  "judge_cards",
  "card_scores",
  "feedback_items",
  "redos",
  "bank_entries",
  "roadmap_stages",
  "chats",
  "messages",
  "research_runs",
  "book_requests",
  "ai_calls",
  "activity_log",
] as const;

export type DataModelTable = (typeof DATA_MODEL_TABLES)[number];

/** Free research sources from the Stack section (F-381). Researcher uses Gateway web search; these are the preferred corpora. */
export const FREE_RESEARCH_SOURCES = [
  { id: "openalex", name: "OpenAlex", kind: "academic" },
  { id: "semantic_scholar", name: "Semantic Scholar", kind: "academic" },
  { id: "crossref", name: "Crossref", kind: "academic" },
  { id: "open_library", name: "Open Library", kind: "books" },
  { id: "google_books", name: "Google Books", kind: "books" },
  { id: "gutenberg", name: "Project Gutenberg", kind: "public_domain" },
  { id: "sep", name: "Stanford Encyclopedia of Philosophy", kind: "frameworks" },
  { id: "iep", name: "Internet Encyclopedia of Philosophy", kind: "frameworks" },
  { id: "courtlistener", name: "CourtListener", kind: "court" },
  { id: "wikipedia", name: "Wikipedia", kind: "orientation_only" },
  { id: "arxiv", name: "arXiv", kind: "academic" },
  { id: "guardian", name: "The Guardian API", kind: "news" },
] as const;

export type TableCountMap = Record<string, number>;

/** Sample store uses practice_* names for sessions/rounds; team_memberships are derived. */
const SAMPLE_STORE_ALIASES: Partial<Record<DataModelTable, string>> = {
  sessions: "practice_sessions",
  rounds: "practice_rounds",
};

/**
 * Row counts for every Data model table. Sample mode reads the local store;
 * live mode uses the service role (bypasses RLS after 00019).
 */
export async function listDataModelTableCounts(): Promise<TableCountMap> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const out: TableCountMap = {};
    for (const name of DATA_MODEL_TABLES) {
      if (name === "team_memberships") {
        out[name] = store.people.filter((p) => p.team_id).length;
        continue;
      }
      const key = (SAMPLE_STORE_ALIASES[name] ?? name) as keyof typeof store;
      const val = store[key];
      out[name] = Array.isArray(val) ? val.length : 0;
    }
    return out;
  }

  const sb = getServiceSupabase();
  const out: TableCountMap = {};
  for (const name of DATA_MODEL_TABLES) {
    const { count, error } = await sb
      .from(name)
      .select("*", { count: "exact", head: true });
    assertOk(error, `listDataModelTableCounts:${name}`);
    out[name] = count ?? 0;
  }
  return out;
}

/** True when 00019 recorded its hardening stamp in app_kv. */
export async function isDataModelHardened(): Promise<boolean> {
  if (isSampleDataMode()) return true;
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("app_kv")
    .select("value")
    .eq("key", "data_model_hardening")
    .maybeSingle();
  assertOk(error, "isDataModelHardened");
  const migration = (data?.value as { migration?: string } | null)?.migration;
  return migration === "00019";
}

export type AiCallsLedgerFilter = {
  fromIso?: string;
  feature?: string;
  personId?: string;
  limit?: number;
};

/** Cost ledger rows for admin / cap audits (F-331). */
export async function queryAiCallsLedger(
  filter: AiCallsLedgerFilter = {},
): Promise<
  {
    id: string;
    feature: string;
    model: string;
    tokens_in: number;
    tokens_out: number;
    cost_usd: number;
    person_id: string | null;
    refused: boolean;
    refuse_reason: string | null;
    created_at: string;
  }[]
> {
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);

  if (isSampleDataMode()) {
    const store = await readStore();
    let rows = [...store.ai_calls];
    if (filter.fromIso) {
      const from = new Date(filter.fromIso).getTime();
      rows = rows.filter((r) => new Date(r.created_at).getTime() >= from);
    }
    if (filter.feature) rows = rows.filter((r) => r.feature === filter.feature);
    if (filter.personId) {
      rows = rows.filter((r) => r.person_id === filter.personId);
    }
    return rows
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        feature: r.feature,
        model: r.model,
        tokens_in: r.tokens_in,
        tokens_out: r.tokens_out,
        cost_usd: Number(r.cost_usd),
        person_id: r.person_id,
        refused: Boolean(r.refused),
        refuse_reason: r.refuse_reason ?? null,
        created_at: r.created_at,
      }));
  }

  const sb = getServiceSupabase();
  let q = sb
    .from("ai_calls")
    .select(
      "id,feature,model,tokens_in,tokens_out,cost_usd,person_id,refused,refuse_reason,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (filter.fromIso) q = q.gte("created_at", filter.fromIso);
  if (filter.feature) q = q.eq("feature", filter.feature);
  if (filter.personId) q = q.eq("person_id", filter.personId);
  const { data, error } = await q;
  assertOk(error, "queryAiCallsLedger");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    feature: r.feature as string,
    model: r.model as string,
    tokens_in: Number(r.tokens_in ?? 0),
    tokens_out: Number(r.tokens_out ?? 0),
    cost_usd: Number(r.cost_usd ?? 0),
    person_id: (r.person_id as string | null) ?? null,
    refused: Boolean(r.refused),
    refuse_reason: (r.refuse_reason as string | null) ?? null,
    created_at: r.created_at as string,
  }));
}

/** Competitions that drive deadlines and round defaults (F-309). */
export async function listCompetitions(): Promise<
  {
    id: string;
    name: string;
    date: string;
    place: string | null;
    timings: unknown;
  }[]
> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return (store.competitions ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      date: c.date,
      place: c.place ?? null,
      timings: c.timings ?? null,
    }));
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("competitions")
    .select("id,name,date,place,timings")
    .order("date", { ascending: true });
  assertOk(error, "listCompetitions");
  return (data ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    date: c.date as string,
    place: (c.place as string | null) ?? null,
    timings: c.timings ?? null,
  }));
}

/** Record an audit note in activity_log (always server-side). */
export async function logDataModelAudit(
  action: string,
  target?: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  await logActivity({
    person_id: null,
    action,
    target: target ?? null,
    meta: meta ?? null,
  });
}
