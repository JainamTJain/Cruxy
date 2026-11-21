/**
 * Workstream C Wave 5: judge card analysis persistence.
 * Sample mode keeps rows in memory; live uses service-role Supabase.
 */
import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase } from "@/lib/db/supabase/client";

export type UseDecision = "full" | "reduced" | "feedback_only";

export type JudgeCardAnalysisRow = {
  id: string;
  card_id: string;
  round_id: string;
  judge_id: string | null;
  background_guess: string | null;
  evidence_note: string;
  position_lean_note: string;
  drift_note: string;
  agreement_note: string;
  conflicts_note: string;
  overall_note: string;
  overall_use: UseDecision;
  effective_use: UseDecision;
  override_use: UseDecision | null;
  override_reason: string | null;
  override_by: string | null;
  override_at: string | null;
  worked_example_id: string | null;
  created_at: string;
  created_by: string | null;
};

export type JudgeCardItemUseRow = {
  id: string;
  analysis_id: string;
  item: string;
  use_decision: UseDecision;
  reason: string;
  created_at: string;
};

export type ScoringItemCorrectionRow = {
  item: string;
  delta: number;
  agreement_count: number;
  last_card_ids: string[];
  updated_at: string;
};

export type CruxyJudgeQaRow = {
  id: string;
  round_id: string;
  seat_index: number;
  question: string;
  follow_up: string;
  created_at: string;
  created_by: string | null;
};

const sampleAnalyses: JudgeCardAnalysisRow[] = [];
const sampleItemUses: JudgeCardItemUseRow[] = [];
const sampleCorrections = new Map<string, ScoringItemCorrectionRow>();
const sampleQa: CruxyJudgeQaRow[] = [];

function nowIso() {
  return new Date().toISOString();
}

export async function getAnalysisByCardId(
  cardId: string,
): Promise<JudgeCardAnalysisRow | null> {
  if (isSampleDataMode()) {
    return sampleAnalyses.find((a) => a.card_id === cardId) ?? null;
  }
  const { data, error } = await getServiceSupabase()
    .from("judge_card_analyses")
    .select("*")
    .eq("card_id", cardId)
    .maybeSingle();
  if (error) throw new Error(`getAnalysisByCardId: ${error.message}`);
  return (data as JudgeCardAnalysisRow | null) ?? null;
}

export async function listAnalysesForRound(
  roundId: string,
): Promise<JudgeCardAnalysisRow[]> {
  if (isSampleDataMode()) {
    return sampleAnalyses.filter((a) => a.round_id === roundId);
  }
  const { data, error } = await getServiceSupabase()
    .from("judge_card_analyses")
    .select("*")
    .eq("round_id", roundId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listAnalysesForRound: ${error.message}`);
  return (data as JudgeCardAnalysisRow[]) ?? [];
}

export async function upsertAnalysis(
  row: Omit<JudgeCardAnalysisRow, "id" | "created_at"> & {
    id?: string;
    created_at?: string;
  },
): Promise<JudgeCardAnalysisRow> {
  const full: JudgeCardAnalysisRow = {
    id: row.id ?? randomUUID(),
    created_at: row.created_at ?? nowIso(),
    ...row,
  };

  if (isSampleDataMode()) {
    const i = sampleAnalyses.findIndex((a) => a.card_id === full.card_id);
    if (i >= 0) sampleAnalyses[i] = { ...sampleAnalyses[i]!, ...full, id: sampleAnalyses[i]!.id };
    else sampleAnalyses.push(full);
    return sampleAnalyses.find((a) => a.card_id === full.card_id)!;
  }

  const { data, error } = await getServiceSupabase()
    .from("judge_card_analyses")
    .upsert(
      {
        ...full,
      },
      { onConflict: "card_id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`upsertAnalysis: ${error.message}`);
  return data as JudgeCardAnalysisRow;
}

export async function replaceItemUses(
  analysisId: string,
  items: { item: string; use_decision: UseDecision; reason: string }[],
): Promise<JudgeCardItemUseRow[]> {
  if (isSampleDataMode()) {
    for (let i = sampleItemUses.length - 1; i >= 0; i--) {
      if (sampleItemUses[i]!.analysis_id === analysisId) sampleItemUses.splice(i, 1);
    }
    const rows = items.map((it) => ({
      id: randomUUID(),
      analysis_id: analysisId,
      item: it.item,
      use_decision: it.use_decision,
      reason: it.reason,
      created_at: nowIso(),
    }));
    sampleItemUses.push(...rows);
    return rows;
  }

  const sb = getServiceSupabase();
  await sb.from("judge_card_item_uses").delete().eq("analysis_id", analysisId);
  if (!items.length) return [];
  const payload = items.map((it) => ({
    id: randomUUID(),
    analysis_id: analysisId,
    item: it.item,
    use_decision: it.use_decision,
    reason: it.reason,
    created_at: nowIso(),
  }));
  const { data, error } = await sb
    .from("judge_card_item_uses")
    .insert(payload)
    .select("*");
  if (error) throw new Error(`replaceItemUses: ${error.message}`);
  return (data as JudgeCardItemUseRow[]) ?? [];
}

export async function listItemUses(
  analysisId: string,
): Promise<JudgeCardItemUseRow[]> {
  if (isSampleDataMode()) {
    return sampleItemUses.filter((u) => u.analysis_id === analysisId);
  }
  const { data, error } = await getServiceSupabase()
    .from("judge_card_item_uses")
    .select("*")
    .eq("analysis_id", analysisId);
  if (error) throw new Error(`listItemUses: ${error.message}`);
  return (data as JudgeCardItemUseRow[]) ?? [];
}

export async function getCorrection(
  item: string,
): Promise<ScoringItemCorrectionRow | null> {
  if (isSampleDataMode()) return sampleCorrections.get(item) ?? null;
  const { data, error } = await getServiceSupabase()
    .from("scoring_item_corrections")
    .select("*")
    .eq("item", item)
    .maybeSingle();
  if (error) throw new Error(`getCorrection: ${error.message}`);
  return (data as ScoringItemCorrectionRow | null) ?? null;
}

export async function listCorrections(): Promise<ScoringItemCorrectionRow[]> {
  if (isSampleDataMode()) return [...sampleCorrections.values()];
  const { data, error } = await getServiceSupabase()
    .from("scoring_item_corrections")
    .select("*")
    .order("item");
  if (error) throw new Error(`listCorrections: ${error.message}`);
  return (data as ScoringItemCorrectionRow[]) ?? [];
}

export async function upsertCorrection(
  row: ScoringItemCorrectionRow,
): Promise<ScoringItemCorrectionRow> {
  if (isSampleDataMode()) {
    sampleCorrections.set(row.item, row);
    return row;
  }
  const { data, error } = await getServiceSupabase()
    .from("scoring_item_corrections")
    .upsert(row, { onConflict: "item" })
    .select("*")
    .single();
  if (error) throw new Error(`upsertCorrection: ${error.message}`);
  return data as ScoringItemCorrectionRow;
}

export async function listCruxyJudgeQa(
  roundId: string,
): Promise<CruxyJudgeQaRow[]> {
  if (isSampleDataMode()) {
    return sampleQa
      .filter((q) => q.round_id === roundId)
      .sort((a, b) => a.seat_index - b.seat_index);
  }
  const { data, error } = await getServiceSupabase()
    .from("cruxy_judge_qa")
    .select("*")
    .eq("round_id", roundId)
    .order("seat_index");
  if (error) throw new Error(`listCruxyJudgeQa: ${error.message}`);
  return (data as CruxyJudgeQaRow[]) ?? [];
}

export async function upsertCruxyJudgeQa(input: {
  round_id: string;
  seat_index: number;
  question: string;
  follow_up: string;
  created_by?: string | null;
}): Promise<CruxyJudgeQaRow> {
  const row: CruxyJudgeQaRow = {
    id: randomUUID(),
    round_id: input.round_id,
    seat_index: input.seat_index,
    question: input.question,
    follow_up: input.follow_up,
    created_at: nowIso(),
    created_by: input.created_by ?? null,
  };

  if (isSampleDataMode()) {
    const i = sampleQa.findIndex(
      (q) =>
        q.round_id === row.round_id && q.seat_index === row.seat_index,
    );
    if (i >= 0) {
      sampleQa[i] = { ...row, id: sampleQa[i]!.id };
      return sampleQa[i]!;
    }
    sampleQa.push(row);
    return row;
  }

  const { data, error } = await getServiceSupabase()
    .from("cruxy_judge_qa")
    .upsert(
      {
        round_id: row.round_id,
        seat_index: row.seat_index,
        question: row.question,
        follow_up: row.follow_up,
        created_by: row.created_by,
      },
      { onConflict: "round_id,seat_index" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`upsertCruxyJudgeQa: ${error.message}`);
  return data as CruxyJudgeQaRow;
}

export async function countHumanCards(): Promise<number> {
  if (isSampleDataMode()) {
    const { readStore } = await import("@/lib/db/sample-store");
    const store = await readStore();
    return store.judge_cards.filter((c) => !c.cruxy).length;
  }
  const { count, error } = await getServiceSupabase()
    .from("judge_cards")
    .select("id", { count: "exact", head: true })
    .eq("cruxy", false);
  if (error) throw new Error(`countHumanCards: ${error.message}`);
  return count ?? 0;
}
