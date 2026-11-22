/**
 * Persistence for APPE-scored idea travel (migration 00068).
 */
import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase } from "@/lib/db/supabase/client";

export type IdeaTravelSourceKind =
  | "working_section"
  | "accepted_suggestion"
  | "note"
  | "told_cruxy"
  | "coherence";

export type IdeaTravelScoreRow = {
  id: string;
  case_id: string;
  source_team_id: string;
  source_kind: IdeaTravelSourceKind;
  source_ref: string | null;
  idea_text: string;
  appe_score: number;
  would_help_win: boolean;
  reason: string;
  traveled: boolean;
  suggestion_ids: string[];
  created_at: string;
  created_by: string | null;
};

const sample: IdeaTravelScoreRow[] = [];

function nowIso() {
  return new Date().toISOString();
}

export async function insertIdeaTravelScore(
  row: Omit<IdeaTravelScoreRow, "id" | "created_at"> & { id?: string },
): Promise<IdeaTravelScoreRow> {
  const full: IdeaTravelScoreRow = {
    id: row.id ?? randomUUID(),
    case_id: row.case_id,
    source_team_id: row.source_team_id,
    source_kind: row.source_kind,
    source_ref: row.source_ref,
    idea_text: row.idea_text.replace(/[·—–]/g, ","),
    appe_score: row.appe_score,
    would_help_win: row.would_help_win,
    reason: row.reason.replace(/[·—–]/g, ","),
    traveled: row.traveled,
    suggestion_ids: row.suggestion_ids,
    created_at: nowIso(),
    created_by: row.created_by,
  };
  if (isSampleDataMode()) {
    sample.push(full);
    return full;
  }
  const { data, error } = await getServiceSupabase()
    .from("idea_travel_scores")
    .insert({
      id: full.id,
      case_id: full.case_id,
      source_team_id: full.source_team_id,
      source_kind: full.source_kind,
      source_ref: full.source_ref,
      idea_text: full.idea_text,
      appe_score: full.appe_score,
      would_help_win: full.would_help_win,
      reason: full.reason,
      traveled: full.traveled,
      suggestion_ids: full.suggestion_ids,
      created_by: full.created_by,
    })
    .select("*")
    .single();
  if (error) throw new Error(`insertIdeaTravelScore: ${error.message}`);
  return data as IdeaTravelScoreRow;
}

export async function listIdeaTravelScores(opts: {
  caseId: string;
  limit?: number;
}): Promise<IdeaTravelScoreRow[]> {
  if (isSampleDataMode()) {
    return sample
      .filter((r) => r.case_id === opts.caseId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, opts.limit ?? 50);
  }
  const { data, error } = await getServiceSupabase()
    .from("idea_travel_scores")
    .select("*")
    .eq("case_id", opts.caseId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (error) throw new Error(`listIdeaTravelScores: ${error.message}`);
  return (data ?? []) as IdeaTravelScoreRow[];
}
