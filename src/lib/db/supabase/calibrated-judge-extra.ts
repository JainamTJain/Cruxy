/**
 * Workstream C Wave 6: calibrated judge persistence (*-extra for D boundary).
 * Sample mode keeps rows in memory; live uses service-role Supabase.
 */
import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { getServiceSupabase } from "@/lib/db/supabase/client";

export type JudgeCardPairRow = {
  id: string;
  round_id: string;
  team_id: string;
  human_card_id: string;
  cruxy_card_id: string;
  analysis_id: string | null;
  created_at: string;
};

export type CalibratedJudgeItemKappaRow = {
  item: string;
  kappa: number | null;
  n_pairs: number;
  updated_at: string;
};

export type CalibratedJudgeSnapshotRow = {
  id: string;
  round_id: string;
  team_id: string | null;
  cruxy_card_id: string;
  cruxy_mean: number | null;
  corrected_mean: number | null;
  ci_low: number | null;
  ci_high: number | null;
  overall_kappa: number | null;
  n_cards: number;
  item_kappas: Record<string, number | null>;
  enough: boolean;
  message: string;
  updated_at: string;
};

const samplePairs: JudgeCardPairRow[] = [];
const sampleItemKappa = new Map<string, CalibratedJudgeItemKappaRow>();
const sampleSnapshots: CalibratedJudgeSnapshotRow[] = [];

function nowIso() {
  return new Date().toISOString();
}

export async function upsertJudgeCardPair(input: {
  round_id: string;
  team_id: string;
  human_card_id: string;
  cruxy_card_id: string;
  analysis_id?: string | null;
}): Promise<JudgeCardPairRow> {
  const row: JudgeCardPairRow = {
    id: randomUUID(),
    round_id: input.round_id,
    team_id: input.team_id,
    human_card_id: input.human_card_id,
    cruxy_card_id: input.cruxy_card_id,
    analysis_id: input.analysis_id ?? null,
    created_at: nowIso(),
  };

  if (isSampleDataMode()) {
    const i = samplePairs.findIndex(
      (p) =>
        p.human_card_id === row.human_card_id &&
        p.cruxy_card_id === row.cruxy_card_id,
    );
    if (i >= 0) {
      samplePairs[i] = {
        ...samplePairs[i]!,
        analysis_id: row.analysis_id ?? samplePairs[i]!.analysis_id,
        team_id: row.team_id,
      };
      return samplePairs[i]!;
    }
    samplePairs.push(row);
    return row;
  }

  const { data, error } = await getServiceSupabase()
    .from("judge_card_pairs")
    .upsert(
      {
        round_id: row.round_id,
        team_id: row.team_id,
        human_card_id: row.human_card_id,
        cruxy_card_id: row.cruxy_card_id,
        analysis_id: row.analysis_id,
      },
      { onConflict: "human_card_id,cruxy_card_id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`upsertJudgeCardPair: ${error.message}`);
  return data as JudgeCardPairRow;
}

export async function listJudgeCardPairs(opts?: {
  roundId?: string;
}): Promise<JudgeCardPairRow[]> {
  if (isSampleDataMode()) {
    return opts?.roundId
      ? samplePairs.filter((p) => p.round_id === opts.roundId)
      : [...samplePairs];
  }
  let q = getServiceSupabase().from("judge_card_pairs").select("*");
  if (opts?.roundId) q = q.eq("round_id", opts.roundId);
  const { data, error } = await q.order("created_at", { ascending: true });
  if (error) throw new Error(`listJudgeCardPairs: ${error.message}`);
  return (data as JudgeCardPairRow[]) ?? [];
}

export async function upsertItemKappa(input: {
  item: string;
  kappa: number | null;
  n_pairs: number;
}): Promise<CalibratedJudgeItemKappaRow> {
  const row: CalibratedJudgeItemKappaRow = {
    item: input.item,
    kappa: input.kappa,
    n_pairs: input.n_pairs,
    updated_at: nowIso(),
  };
  if (isSampleDataMode()) {
    sampleItemKappa.set(row.item, row);
    return row;
  }
  const { data, error } = await getServiceSupabase()
    .from("calibrated_judge_item_kappa")
    .upsert(row, { onConflict: "item" })
    .select("*")
    .single();
  if (error) throw new Error(`upsertItemKappa: ${error.message}`);
  return data as CalibratedJudgeItemKappaRow;
}

export async function listItemKappas(): Promise<CalibratedJudgeItemKappaRow[]> {
  if (isSampleDataMode()) return [...sampleItemKappa.values()];
  const { data, error } = await getServiceSupabase()
    .from("calibrated_judge_item_kappa")
    .select("*")
    .order("item");
  if (error) throw new Error(`listItemKappas: ${error.message}`);
  return (data as CalibratedJudgeItemKappaRow[]) ?? [];
}

export async function upsertCalibratedSnapshot(
  row: Omit<CalibratedJudgeSnapshotRow, "id" | "updated_at"> & {
    id?: string;
    updated_at?: string;
  },
): Promise<CalibratedJudgeSnapshotRow> {
  const full: CalibratedJudgeSnapshotRow = {
    id: row.id ?? randomUUID(),
    updated_at: row.updated_at ?? nowIso(),
    ...row,
  };

  if (isSampleDataMode()) {
    const i = sampleSnapshots.findIndex(
      (s) =>
        s.round_id === full.round_id &&
        s.cruxy_card_id === full.cruxy_card_id,
    );
    if (i >= 0) {
      sampleSnapshots[i] = { ...full, id: sampleSnapshots[i]!.id };
      return sampleSnapshots[i]!;
    }
    sampleSnapshots.push(full);
    return full;
  }

  const { data, error } = await getServiceSupabase()
    .from("calibrated_judge_snapshots")
    .upsert(
      {
        round_id: full.round_id,
        team_id: full.team_id,
        cruxy_card_id: full.cruxy_card_id,
        cruxy_mean: full.cruxy_mean,
        corrected_mean: full.corrected_mean,
        ci_low: full.ci_low,
        ci_high: full.ci_high,
        overall_kappa: full.overall_kappa,
        n_cards: full.n_cards,
        item_kappas: full.item_kappas,
        enough: full.enough,
        message: full.message,
        updated_at: full.updated_at,
      },
      { onConflict: "round_id,cruxy_card_id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`upsertCalibratedSnapshot: ${error.message}`);
  return data as CalibratedJudgeSnapshotRow;
}

export async function getCalibratedSnapshot(opts: {
  roundId: string;
  cruxyCardId?: string;
}): Promise<CalibratedJudgeSnapshotRow | null> {
  if (isSampleDataMode()) {
    const rows = sampleSnapshots.filter((s) => s.round_id === opts.roundId);
    if (opts.cruxyCardId) {
      return rows.find((s) => s.cruxy_card_id === opts.cruxyCardId) ?? null;
    }
    return rows[0] ?? null;
  }
  let q = getServiceSupabase()
    .from("calibrated_judge_snapshots")
    .select("*")
    .eq("round_id", opts.roundId);
  if (opts.cruxyCardId) q = q.eq("cruxy_card_id", opts.cruxyCardId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`getCalibratedSnapshot: ${error.message}`);
  return (data as CalibratedJudgeSnapshotRow | null) ?? null;
}
