import "server-only";
import { randomUUID } from "crypto";
import { getServiceSupabase, assertOk } from "@/lib/db/supabase/client";
import { listActivityLog, listPeopleFull, listTeams } from "@/lib/db/supabase/foundation";
import type {
  ActivityLogEntry,
  AiCall,
  CalibrationRow,
  CaseRow,
  Competition,
  CompetitionLogEntry,
  DriveSortItem,
  FeatureUsageStat,
  ProgramTotals,
  ReadinessCell,
  SpendCaps,
  WeeklyEmailPreview,
} from "@/lib/types";
import type { BookRequest } from "@/lib/library/types";
import { nowIso } from "@/lib/utils";

/**
 * Supabase path for program-level admin / map / spend / AI ledger helpers.
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

export async function listBookRequests(): Promise<BookRequest[]> {
  const { data, error } = await getServiceSupabase()
    .from("book_requests")
    .select(
      "id, title, reason, chapter, case_id, status, created_at, created_by",
    )
    .order("created_at", { ascending: false });
  assertOk(error, "listBookRequests");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    reason: (r.reason as string | null) ?? null,
    chapter: (r.chapter as string | null) ?? null,
    case_id: (r.case_id as string | null) ?? null,
    status: (r.status as BookRequest["status"]) ?? "open",
    created_at: r.created_at as string,
    created_by: (r.created_by as string | null) ?? null,
  }));
}

export async function listDriveSortQueue(): Promise<DriveSortItem[]> {
  const { data, error } = await getServiceSupabase()
    .from("drive_sort_queue")
    .select("id, filename, hint, confidence, status, created_at")
    .order("created_at", { ascending: false });
  assertOk(error, "listDriveSortQueue");
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    filename: String(r.filename),
    hint: String(r.hint ?? ""),
    confidence: Number(r.confidence ?? 0),
    status: (r.status as DriveSortItem["status"]) ?? "pending",
    created_at: String(r.created_at),
  }));
}

export async function sortDriveItem(
  id: string,
  status: DriveSortItem["status"] = "sorted",
): Promise<DriveSortItem | null> {
  const { data, error } = await getServiceSupabase()
    .from("drive_sort_queue")
    .update({ status })
    .eq("id", id)
    .select("id, filename, hint, confidence, status, created_at")
    .maybeSingle();
  assertOk(error, "sortDriveItem");
  if (!data) return null;
  return {
    id: data.id as string,
    filename: data.filename as string,
    hint: String(data.hint ?? ""),
    confidence: Number(data.confidence ?? 0),
    status: (data.status as DriveSortItem["status"]) ?? "pending",
    created_at: data.created_at as string,
  };
}

export async function listCalibration(): Promise<CalibrationRow[]> {
  const { data, error } = await getServiceSupabase()
    .from("calibration_rows")
    .select("id, label, gap, judge_name, weight, human_cards, created_at")
    .order("created_at", { ascending: false });
  assertOk(error, "listCalibration");
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    label: String(r.label),
    gap: Number(r.gap),
    judge_name: (r.judge_name as string | null) ?? null,
    weight: r.weight == null ? null : Number(r.weight),
    human_cards: Number(r.human_cards ?? 0),
    created_at: String(r.created_at),
  }));
}

export async function listCompetitionLogs(): Promise<CompetitionLogEntry[]> {
  const { data, error } = await getServiceSupabase()
    .from("competition_logs")
    .select(
      "id, competition_id, case_id, case_number, opponent, moderator_question, judges_questions, judge_comments, score_us, score_them, result, team_id, created_at, created_by",
    )
    .order("created_at", { ascending: false });
  assertOk(error, "listCompetitionLogs");
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    competition_id: String(r.competition_id),
    case_id: (r.case_id as string | null) ?? null,
    case_number: r.case_number == null ? null : Number(r.case_number),
    opponent: String(r.opponent),
    moderator_question: (r.moderator_question as string | null) ?? null,
    judges_questions: (r.judges_questions as string | null) ?? null,
    judge_comments: (r.judge_comments as string | null) ?? null,
    score_us: r.score_us == null ? null : Number(r.score_us),
    score_them: r.score_them == null ? null : Number(r.score_them),
    result: (r.result as CompetitionLogEntry["result"]) ?? null,
    team_id: (r.team_id as string | null) ?? null,
    created_at: String(r.created_at),
    created_by: (r.created_by as string | null) ?? null,
  }));
}

export async function addCompetitionLog(
  entry: Omit<CompetitionLogEntry, "id" | "created_at">,
): Promise<CompetitionLogEntry> {
  const row = {
    id: randomUUID(),
    ...entry,
    created_at: nowIso(),
  };
  const { data, error } = await getServiceSupabase()
    .from("competition_logs")
    .insert(row)
    .select(
      "id, competition_id, case_id, case_number, opponent, moderator_question, judges_questions, judge_comments, score_us, score_them, result, team_id, created_at, created_by",
    )
    .single();
  assertOk(error, "addCompetitionLog");
  if (!data) throw new Error("addCompetitionLog: no row returned");
  return {
    ...(data as CompetitionLogEntry),
    score_us: data.score_us == null ? null : Number(data.score_us),
    score_them: data.score_them == null ? null : Number(data.score_them),
  };
}

export async function recordLastVisit(personId: string): Promise<void> {
  const { error } = await getServiceSupabase().from("last_visits").upsert(
    { person_id: personId, at: nowIso() },
    { onConflict: "person_id" },
  );
  assertOk(error, "recordLastVisit");
}

export async function getLastVisit(personId: string): Promise<string | null> {
  const { data, error } = await getServiceSupabase()
    .from("last_visits")
    .select("at")
    .eq("person_id", personId)
    .maybeSingle();
  assertOk(error, "getLastVisit");
  return (data?.at as string | undefined) ?? null;
}

export async function changesSince(
  sinceIso: string | null,
  limit = 20,
): Promise<ActivityLogEntry[]> {
  const log = await listActivityLog(200);
  if (!sinceIso) return log.slice(0, limit);
  const since = new Date(sinceIso).getTime();
  return log.filter((e) => new Date(e.at).getTime() > since).slice(0, limit);
}

export async function featureUsageStats(): Promise<FeatureUsageStat[]> {
  const [calls, usefulRes] = await Promise.all([
    listAiCalls(),
    getServiceSupabase().from("feature_useful").select("feature, person_id"),
  ]);
  assertOk(usefulRes.error, "featureUsageStats.useful");
  const byFeature = new Map<
    string,
    { uses: number; people: Set<string>; useful: number }
  >();
  for (const c of calls) {
    if (c.refused) continue;
    const cur = byFeature.get(c.feature) ?? {
      uses: 0,
      people: new Set<string>(),
      useful: 0,
    };
    cur.uses += 1;
    if (c.person_id) cur.people.add(c.person_id);
    byFeature.set(c.feature, cur);
  }
  for (const u of usefulRes.data ?? []) {
    const feature = String((u as { feature: string }).feature);
    const cur = byFeature.get(feature) ?? {
      uses: 0,
      people: new Set<string>(),
      useful: 0,
    };
    cur.useful += 1;
    byFeature.set(feature, cur);
  }
  return [...byFeature.entries()].map(([feature, v]) => ({
    feature,
    uses: v.uses,
    unique_people: v.people.size,
    useful_marks: v.useful,
  }));
}

export async function markFeatureUseful(
  feature: string,
  personId: string,
): Promise<void> {
  const { error } = await getServiceSupabase().from("feature_useful").insert({
    id: randomUUID(),
    feature,
    person_id: personId,
    at: nowIso(),
  });
  assertOk(error, "markFeatureUseful");
}

export async function teamReadinessAverages(): Promise<
  { team_id: string; avg: number; delta_week: number }[]
> {
  const [readiness, teams] = await Promise.all([listReadiness(), listTeams()]);
  const byTeam = new Map<string, number[]>();
  for (const cell of readiness) {
    const arr = byTeam.get(cell.team_id) ?? [];
    arr.push(cell.readiness_pct);
    byTeam.set(cell.team_id, arr);
  }
  // No historical snapshot table yet — report 0 week delta in live mode.
  void teams;
  return [...byTeam.entries()].map(([team_id, vals]) => ({
    team_id,
    avg: vals.length
      ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
      : 0,
    delta_week: 0,
  }));
}

export async function buildWeeklyEmailPreview(): Promise<WeeklyEmailPreview> {
  const [teams, people, readiness, spent, caps, aiCalls, cells, cases] =
    await Promise.all([
      listTeams(),
      listPeopleFull(),
      teamReadinessAverages(),
      sumMonthlySpendUsd(),
      getSpendCaps(),
      listAiCalls(),
      listReadiness(),
      listCases(),
    ]);

  const opted = people.filter(
    (p) =>
      (p.role === "tech_admin" || p.role === "coach_admin") &&
      p.digest_opt_in &&
      p.email,
  );

  return {
    attendance: people
      .filter((p) => p.role === "member" || p.role === "tech_admin")
      .slice(0, 12)
      .map((p) => ({
        name: p.name,
        sessions: 0,
        present: p.last_sign_in_at ? 1 : 0,
      })),
    scoresByTeam: teams.map((t) => {
      const r = readiness.find((x) => x.team_id === t.id);
      return {
        team: t.name,
        rounds: 0,
        avg: r ? Math.round((r.avg / 100) * 60) : 0,
      };
    }),
    biggestImprovements: readiness
      .filter((r) => r.delta_week > 0)
      .sort((a, b) => b.delta_week - a.delta_week)
      .slice(0, 3)
      .map((r) => {
        const team = teams.find((t) => t.id === r.team_id)?.name ?? "Team";
        return `${team} readiness ${r.avg}%`;
      }),
    casesAtRisk: cells
      .filter((c) => c.readiness_pct < 35)
      .slice(0, 4)
      .map((c) => {
        const team = teams.find((t) => t.id === c.team_id)?.name ?? "?";
        const cas = cases.find((x) => x.id === c.case_id);
        return `${team}, Case ${cas?.number ?? "?"} at ${c.readiness_pct}%`;
      }),
    openDisagreements: [],
    thingsToCare: [],
    spendLine: `$${spent.toFixed(2)} / $${caps.monthly_usd} this month`,
    errors: aiCalls
      .filter((c) => c.refused)
      .slice(0, 5)
      .map((c) => `${c.feature}: ${c.refuse_reason ?? "refused"}`),
    recipients: opted.map((p) => ({
      name: p.name,
      email: p.email!,
      includeSpend: p.role === "tech_admin",
    })),
  };
}
