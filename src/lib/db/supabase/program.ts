import "server-only";
import { getServiceSupabase, assertOk } from "@/lib/db/supabase/client";
import type {
  AiCall,
  CaseRow,
  Competition,
  ProgramTotals,
  ReadinessCell,
  SpendCaps,
} from "@/lib/types";

/**
 * Supabase path for program-level reads the sign-in screen, program map and
 * callCruxy depend on: competitions, cases, live totals, readiness, spend caps
 * and the AI cost ledger.
 */

async function countRows(
  table: string,
  eq?: [column: string, value: string],
): Promise<number> {
  let q = getServiceSupabase()
    .from(table)
    .select("*", { count: "exact", head: true });
  if (eq) q = q.eq(eq[0], eq[1]);
  const { count, error } = await q;
  assertOk(error, `count ${table}`);
  return count ?? 0;
}

export async function listCompetitions(): Promise<Competition[]> {
  const { data, error } = await getServiceSupabase()
    .from("competitions")
    .select("id, name, date, place, timings, created_at")
    .order("date", { ascending: true });
  assertOk(error, "listCompetitions");
  return (data ?? []) as Competition[];
}

export async function listCases(): Promise<CaseRow[]> {
  const { data, error } = await getServiceSupabase()
    .from("cases")
    .select(
      "id, number, title, case_set_page, crux, trap, closing_question, active, created_at",
    )
    .order("number", { ascending: true });
  assertOk(error, "listCases");
  return (data ?? []) as CaseRow[];
}

/** Live counts from the real tables; pipeline-maintained counters come from program_totals. */
export async function getProgramTotals(): Promise<ProgramTotals> {
  const sb = getServiceSupabase();
  const [files, passages, ideas, questions, reports, stored] = await Promise.all([
    countRows("files"),
    countRows("passages"),
    countRows("truth_items", ["status", "accepted"]),
    countRows("questions"),
    countRows("round_reports"),
    sb
      .from("program_totals")
      .select("sources_verified, redo_improvements")
      .eq("id", 1)
      .maybeSingle(),
  ]);
  assertOk(stored.error, "program_totals");
  return {
    drive_files: files,
    passages_cited: passages,
    ideas_accepted: ideas,
    sources_verified: Number(stored.data?.sources_verified ?? 0),
    bank_questions: questions,
    rounds_graded: reports,
    redo_improvements: Number(stored.data?.redo_improvements ?? 0),
  };
}

export async function listReadiness(): Promise<ReadinessCell[]> {
  const { data, error } = await getServiceSupabase()
    .from("readiness_cells")
    .select("id, team_id, case_id, readiness_pct, lead_names, latest_event, updated_at");
  assertOk(error, "listReadiness");
  return (data ?? []) as ReadinessCell[];
}

export async function getSpendCaps(): Promise<SpendCaps> {
  const { data, error } = await getServiceSupabase()
    .from("spend_caps")
    .select(
      "monthly_usd, per_round_usd, per_research_night_usd, per_person_assistant_day_usd, research_paused, updated_at, updated_by",
    )
    .eq("id", 1)
    .single();
  assertOk(error, "getSpendCaps");
  const d = data as Record<string, unknown>;
  return {
    monthly_usd: Number(d.monthly_usd),
    per_round_usd: Number(d.per_round_usd),
    per_research_night_usd: Number(d.per_research_night_usd),
    per_person_assistant_day_usd: Number(d.per_person_assistant_day_usd),
    research_paused: Boolean(d.research_paused),
    updated_at: String(d.updated_at),
    updated_by: (d.updated_by as string | null) ?? null,
  };
}

export async function updateSpendCaps(
  patch: Partial<SpendCaps>,
  actorId: string,
): Promise<SpendCaps> {
  const { error } = await getServiceSupabase()
    .from("spend_caps")
    .update({ ...patch, updated_at: new Date().toISOString(), updated_by: actorId })
    .eq("id", 1);
  assertOk(error, "updateSpendCaps");
  return getSpendCaps();
}

export async function insertAiCall(
  call: Omit<AiCall, "id" | "created_at">,
): Promise<AiCall> {
  const { data, error } = await getServiceSupabase()
    .from("ai_calls")
    .insert({
      feature: call.feature,
      model: call.model,
      tokens_in: call.tokens_in,
      tokens_out: call.tokens_out,
      cost_usd: call.cost_usd,
      person_id: call.person_id,
      refused: call.refused,
      refuse_reason: call.refuse_reason,
    })
    .select(
      "id, feature, model, tokens_in, tokens_out, cost_usd, person_id, refused, refuse_reason, created_at",
    )
    .single();
  assertOk(error, "insertAiCall");
  const row = data as AiCall;
  return { ...row, cost_usd: Number(row.cost_usd) };
}

export async function listAiCalls(): Promise<AiCall[]> {
  const { data, error } = await getServiceSupabase()
    .from("ai_calls")
    .select(
      "id, feature, model, tokens_in, tokens_out, cost_usd, person_id, refused, refuse_reason, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(5000);
  assertOk(error, "listAiCalls");
  return ((data ?? []) as AiCall[]).map((r) => ({ ...r, cost_usd: Number(r.cost_usd) }));
}

export async function sumMonthlySpendUsd(now = new Date()): Promise<number> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const { data, error } = await getServiceSupabase()
    .from("ai_calls")
    .select("cost_usd")
    .eq("refused", false)
    .gte("created_at", start.toISOString());
  assertOk(error, "sumMonthlySpendUsd");
  return (data ?? []).reduce((s, r) => s + Number((r as { cost_usd: number }).cost_usd), 0);
}
