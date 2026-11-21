/**
 * Workstream H data helpers (example library, feedback, weekly review, match_passages).
 * Sample-mode dispatch lives in src/lib/cruxy/examples.ts and context.ts.
 */
import "server-only";

import { getServiceSupabase } from "@/lib/db/supabase/client";

export type MatchedPassage = {
  id: string;
  file_id: string | null;
  case_id: string | null;
  anchor: string | null;
  text: string;
  similarity: number;
};

export async function rpcMatchPassages(input: {
  queryEmbedding: number[];
  caseId: string;
  matchCount: number;
}): Promise<MatchedPassage[]> {
  const { data, error } = await getServiceSupabase().rpc("match_passages", {
    query_embedding: input.queryEmbedding,
    case_id: input.caseId,
    match_count: input.matchCount,
  });
  if (error) throw new Error(`match_passages: ${error.message}`);
  return (data ?? []) as MatchedPassage[];
}

export type WorkedExampleRow = {
  id: string;
  kind: "strong" | "weak";
  agent: string;
  case_id: string | null;
  team_id: string | null;
  title: string;
  body: string;
  what_went_wrong: string | null;
  citation_ids: string[];
  embedding: number[] | null;
  source_ref: string | null;
  created_at: string;
  created_by: string | null;
  approved: boolean;
  approved_at: string | null;
  approved_by: string | null;
};

export type CruxyFeedbackRow = {
  id: string;
  person_id: string;
  agent: string;
  feature: string;
  output_ref: string | null;
  case_id: string | null;
  verdict: "useful" | "not_useful" | "wrong";
  reason: string | null;
  created_at: string;
  created_by: string | null;
};

export type WeeklyReviewDraftRow = {
  id: string;
  week_start: string;
  draft_body: string;
  proposed_example_ids: string[];
  proposed_check_updates: unknown[];
  status: "pending" | "approved" | "rejected";
  created_at: string;
  created_by: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
};

export async function insertWorkedExample(
  row: Omit<WorkedExampleRow, "created_at" | "approved_at" | "approved_by"> & {
    created_at?: string;
  },
): Promise<WorkedExampleRow> {
  const { data, error } = await getServiceSupabase()
    .from("worked_examples")
    .insert({
      id: row.id,
      kind: row.kind,
      agent: row.agent,
      case_id: row.case_id,
      team_id: row.team_id,
      title: row.title,
      body: row.body,
      what_went_wrong: row.what_went_wrong,
      citation_ids: row.citation_ids,
      embedding: row.embedding,
      source_ref: row.source_ref,
      created_by: row.created_by,
      approved: row.approved,
    })
    .select("*")
    .single();
  if (error) throw new Error(`worked_examples insert: ${error.message}`);
  return data as WorkedExampleRow;
}

export async function listWorkedExamples(opts?: {
  caseId?: string | null;
  agent?: string | null;
  approvedOnly?: boolean;
  limit?: number;
}): Promise<WorkedExampleRow[]> {
  let q = getServiceSupabase().from("worked_examples").select("*");
  if (opts?.caseId) q = q.eq("case_id", opts.caseId);
  if (opts?.agent) q = q.eq("agent", opts.agent);
  if (opts?.approvedOnly) q = q.eq("approved", true);
  q = q.order("created_at", { ascending: false }).limit(opts?.limit ?? 20);
  const { data, error } = await q;
  if (error) throw new Error(`worked_examples list: ${error.message}`);
  return (data ?? []) as WorkedExampleRow[];
}

export async function insertCruxyFeedback(
  row: Omit<CruxyFeedbackRow, "created_at"> & { created_at?: string },
): Promise<CruxyFeedbackRow> {
  const { data, error } = await getServiceSupabase()
    .from("cruxy_feedback")
    .insert({
      id: row.id,
      person_id: row.person_id,
      agent: row.agent,
      feature: row.feature,
      output_ref: row.output_ref,
      case_id: row.case_id,
      verdict: row.verdict,
      reason: row.reason,
      created_by: row.created_by,
    })
    .select("*")
    .single();
  if (error) throw new Error(`cruxy_feedback insert: ${error.message}`);
  return data as CruxyFeedbackRow;
}

export async function listCruxyFeedback(opts?: {
  since?: string;
  limit?: number;
}): Promise<CruxyFeedbackRow[]> {
  let q = getServiceSupabase()
    .from("cruxy_feedback")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 100);
  if (opts?.since) q = q.gte("created_at", opts.since);
  const { data, error } = await q;
  if (error) throw new Error(`cruxy_feedback list: ${error.message}`);
  return (data ?? []) as CruxyFeedbackRow[];
}

export async function insertWeeklyReviewDraft(
  row: Omit<
    WeeklyReviewDraftRow,
    "created_at" | "reviewed_at" | "reviewed_by" | "review_note"
  > & { created_at?: string },
): Promise<WeeklyReviewDraftRow> {
  const { data, error } = await getServiceSupabase()
    .from("weekly_review_drafts")
    .insert({
      id: row.id,
      week_start: row.week_start,
      draft_body: row.draft_body,
      proposed_example_ids: row.proposed_example_ids,
      proposed_check_updates: row.proposed_check_updates,
      status: row.status,
      created_by: row.created_by,
    })
    .select("*")
    .single();
  if (error) throw new Error(`weekly_review_drafts insert: ${error.message}`);
  return data as WeeklyReviewDraftRow;
}

export async function updateWeeklyReviewDraftStatus(input: {
  id: string;
  status: "approved" | "rejected";
  reviewedBy: string;
  reviewNote?: string | null;
}): Promise<WeeklyReviewDraftRow> {
  const { data, error } = await getServiceSupabase()
    .from("weekly_review_drafts")
    .update({
      status: input.status,
      reviewed_at: new Date().toISOString(),
      reviewed_by: input.reviewedBy,
      review_note: input.reviewNote ?? null,
    })
    .eq("id", input.id)
    .select("*")
    .single();
  if (error) throw new Error(`weekly_review_drafts update: ${error.message}`);
  return data as WeeklyReviewDraftRow;
}

export async function listWeeklyReviewDrafts(opts?: {
  status?: string;
  limit?: number;
}): Promise<WeeklyReviewDraftRow[]> {
  let q = getServiceSupabase()
    .from("weekly_review_drafts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 20);
  if (opts?.status) q = q.eq("status", opts.status);
  const { data, error } = await q;
  if (error) throw new Error(`weekly_review_drafts list: ${error.message}`);
  return (data ?? []) as WeeklyReviewDraftRow[];
}

export async function listPassagesForCase(
  caseId: string,
  limit = 40,
): Promise<
  Array<{
    id: string;
    file_id: string | null;
    case_id: string | null;
    anchor: string | null;
    text: string;
    embedding: number[] | null;
  }>
> {
  // Prefer passages.case_id; also pull via files.case_ids.
  const sb = getServiceSupabase();
  const { data: direct, error: e1 } = await sb
    .from("passages")
    .select("id, file_id, case_id, anchor, text, embedding")
    .eq("case_id", caseId)
    .limit(limit);
  if (e1) throw new Error(`passages by case: ${e1.message}`);

  const { data: files, error: e2 } = await sb
    .from("files")
    .select("id")
    .contains("case_ids", [caseId])
    .limit(40);
  if (e2) throw new Error(`files by case: ${e2.message}`);

  const fileIds = (files ?? []).map((f: { id: string }) => f.id);
  let viaFiles: typeof direct = [];
  if (fileIds.length) {
    const { data, error } = await sb
      .from("passages")
      .select("id, file_id, case_id, anchor, text, embedding")
      .in("file_id", fileIds)
      .limit(limit);
    if (error) throw new Error(`passages via files: ${error.message}`);
    viaFiles = data ?? [];
  }

  const byId = new Map<string, (typeof direct)[number]>();
  for (const p of [...(direct ?? []), ...viaFiles]) {
    byId.set(p.id, p);
  }
  return [...byId.values()].slice(0, limit);
}
