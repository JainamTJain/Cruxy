/**
 * Workstream H Wave 6: robustness tables + case-scoped edge reads.
 * Writes go through K's recordEdge() in src/lib/graph.
 */
import "server-only";

import { randomUUID } from "crypto";
import { getServiceSupabase, assertOk } from "@/lib/db/supabase/client";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore } from "@/lib/db/sample-store";
import { nowIso } from "@/lib/utils";
import type { ArgEdge, ArgNodeKind } from "@/lib/graph/types";
import type { ClaimRobustnessScore } from "@/lib/arg-graph/types";

const sampleCandidates: ArgCandidateNodeRow[] = [];
const sampleClassifications: JudgeQClassificationRow[] = [];
const sampleScores: ClaimRobustnessScore[] = [];

export type ArgCandidateNodeRow = {
  id: string;
  team_id: string;
  case_id: string;
  kind: ArgNodeKind | "candidate";
  text: string;
  import_id: string | null;
  proposal_id: string | null;
  citation_ids: string[];
  status: "candidate" | "promoted" | "dismissed";
  created_by: string | null;
  created_at: string;
};

export type JudgeQClassificationRow = {
  id: string;
  round_id: string;
  question_source: string;
  question_id: string;
  question_text: string;
  claim_id: string | null;
  team_id: string | null;
  case_id: string | null;
  citation_ids: string[];
  rationale: string | null;
  edge_id: string | null;
  created_at: string;
  created_by: string | null;
};

function rowToEdge(row: Record<string, unknown>): ArgEdge {
  return {
    id: String(row.id),
    edge_key: String(row.edge_key ?? row.id),
    from_kind: row.from_kind as ArgEdge["from_kind"],
    from_id: String(row.from_id),
    to_kind: row.to_kind as ArgEdge["to_kind"],
    to_id: String(row.to_id),
    type: row.type as ArgEdge["type"],
    weight: Number(row.weight ?? 1),
    source_kind: (row.source_kind as string | null) ?? null,
    source_id: (row.source_id as string | null) ?? null,
    round_id: (row.round_id as string | null) ?? null,
    line_id: (row.line_id as string | null) ?? null,
    team_id: (row.team_id as string | null) ?? null,
    case_id: (row.case_id as string | null) ?? null,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at ?? nowIso()),
  };
}

/** All edges for a case (K's arg_edges). */
export async function listEdgesForCase(caseId: string): Promise<ArgEdge[]> {
  if (isSampleDataMode()) {
    const store = (await readStore()) as unknown as { arg_edges?: ArgEdge[] };
    return (store.arg_edges ?? []).filter((e) => e.case_id === caseId);
  }

  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("arg_edges")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(5000);
  assertOk(error, "listEdgesForCase");
  return ((data as Record<string, unknown>[]) ?? []).map(rowToEdge);
}

export async function upsertCandidateNode(
  row: Omit<ArgCandidateNodeRow, "id" | "created_at"> & {
    id?: string;
    created_at?: string;
  },
): Promise<ArgCandidateNodeRow> {
  const full: ArgCandidateNodeRow = {
    id: row.id ?? randomUUID(),
    team_id: row.team_id,
    case_id: row.case_id,
    kind: row.kind,
    text: row.text,
    import_id: row.import_id,
    proposal_id: row.proposal_id,
    citation_ids: row.citation_ids ?? [],
    status: row.status ?? "candidate",
    created_by: row.created_by,
    created_at: row.created_at ?? nowIso(),
  };

  if (isSampleDataMode()) {
    sampleCandidates.unshift(full);
    return full;
  }

  const { data, error } = await getServiceSupabase()
    .from("arg_candidate_nodes")
    .insert(full)
    .select("*")
    .single();
  if (error) throw new Error(`arg_candidate_nodes: ${error.message}`);
  return data as ArgCandidateNodeRow;
}

export async function listCandidateNodes(input: {
  teamId: string;
  caseId: string;
}): Promise<ArgCandidateNodeRow[]> {
  if (isSampleDataMode()) {
    return sampleCandidates.filter(
      (c) =>
        c.team_id === input.teamId &&
        c.case_id === input.caseId &&
        c.status === "candidate",
    );
  }
  const { data, error } = await getServiceSupabase()
    .from("arg_candidate_nodes")
    .select("*")
    .eq("team_id", input.teamId)
    .eq("case_id", input.caseId)
    .eq("status", "candidate")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`arg_candidate_nodes list: ${error.message}`);
  return (data as ArgCandidateNodeRow[]) ?? [];
}

export async function upsertJudgeQClassification(
  row: Omit<JudgeQClassificationRow, "id" | "created_at"> & {
    id?: string;
    created_at?: string;
  },
): Promise<JudgeQClassificationRow> {
  const full: JudgeQClassificationRow = {
    id: row.id ?? randomUUID(),
    round_id: row.round_id,
    question_source: row.question_source,
    question_id: row.question_id,
    question_text: row.question_text,
    claim_id: row.claim_id,
    team_id: row.team_id,
    case_id: row.case_id,
    citation_ids: row.citation_ids ?? [],
    rationale: row.rationale,
    edge_id: row.edge_id,
    created_by: row.created_by,
    created_at: row.created_at ?? nowIso(),
  };

  if (isSampleDataMode()) {
    const i = sampleClassifications.findIndex(
      (c) =>
        c.question_source === full.question_source &&
        c.question_id === full.question_id,
    );
    if (i >= 0) {
      sampleClassifications[i] = { ...full, id: sampleClassifications[i]!.id };
      return sampleClassifications[i]!;
    }
    sampleClassifications.push(full);
    return full;
  }

  const { data, error } = await getServiceSupabase()
    .from("judge_q_classifications")
    .upsert(
      {
        round_id: full.round_id,
        question_source: full.question_source,
        question_id: full.question_id,
        question_text: full.question_text,
        claim_id: full.claim_id,
        team_id: full.team_id,
        case_id: full.case_id,
        citation_ids: full.citation_ids,
        rationale: full.rationale,
        edge_id: full.edge_id,
        created_by: full.created_by,
      },
      { onConflict: "question_source,question_id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`judge_q_classifications: ${error.message}`);
  return data as JudgeQClassificationRow;
}

export async function listJudgeQClassificationsForCase(
  caseId: string,
): Promise<JudgeQClassificationRow[]> {
  if (isSampleDataMode()) {
    return sampleClassifications.filter((c) => c.case_id === caseId);
  }
  const { data, error } = await getServiceSupabase()
    .from("judge_q_classifications")
    .select("*")
    .eq("case_id", caseId);
  if (error) throw new Error(`judge_q_classifications list: ${error.message}`);
  return (data as JudgeQClassificationRow[]) ?? [];
}

export async function upsertClaimRobustnessScores(
  rows: ClaimRobustnessScore[],
): Promise<void> {
  if (!rows.length) return;
  if (isSampleDataMode()) {
    for (const r of rows) {
      const i = sampleScores.findIndex((s) => s.claim_id === r.claim_id);
      if (i >= 0) sampleScores[i] = r;
      else sampleScores.push(r);
    }
    return;
  }
  const payload = rows.map((r) => ({
    claim_id: r.claim_id,
    team_id: r.team_id,
    case_id: r.case_id,
    score: r.score,
    score_pct: r.score_pct,
    attacks_answered: r.attacks_answered,
    attacks_open: r.attacks_open,
    open_from_rounds: r.open_from_rounds,
    open_from_round_dates: r.open_from_round_dates ?? [],
    support_strength: r.support_strength,
    attack_strength: r.attack_strength,
    updated_at: nowIso(),
  }));
  const { error } = await getServiceSupabase()
    .from("claim_robustness_scores")
    .upsert(payload, { onConflict: "claim_id" });
  if (error) throw new Error(`claim_robustness_scores: ${error.message}`);
}

export async function listClaimRobustnessScoresForCase(
  caseId: string,
): Promise<ClaimRobustnessScore[]> {
  if (isSampleDataMode()) {
    return sampleScores.filter((s) => s.case_id === caseId);
  }
  const { data, error } = await getServiceSupabase()
    .from("claim_robustness_scores")
    .select("*")
    .eq("case_id", caseId);
  if (error) throw new Error(`claim_robustness_scores list: ${error.message}`);
  return ((data as ClaimRobustnessScore[]) ?? []).map((r) => ({
    ...r,
    open_from_rounds: r.open_from_rounds ?? [],
    open_from_round_dates: r.open_from_round_dates ?? [],
  }));
}
