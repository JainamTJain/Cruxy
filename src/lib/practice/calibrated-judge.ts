/**
 * Wave 6 C: calibrated judge.
 * Pair human cards with Cruxy cards, Cohen's kappa (chance-corrected),
 * and a bias-corrected bootstrap interval for Cruxy's mean score.
 * Real analysed cards only. Report kappa, never raw exact-match %.
 */
import { createHash } from "crypto";
import { listJudgeCards } from "@/lib/db/practice-repository";
import { getAnalysisByCardId } from "@/lib/db/supabase/judge-card-extra";
import {
  listJudgeCardPairs,
  upsertCalibratedSnapshot,
  upsertItemKappa,
  upsertJudgeCardPair,
  type CalibratedJudgeSnapshotRow,
} from "@/lib/db/supabase/calibrated-judge-extra";
import { ensureRoundCardAnalyses } from "@/lib/practice/judge-card-analysis";
import { APPE_SCORE_ITEMS } from "@/lib/practice/types";
import type { CardScore, JudgeCard } from "@/lib/practice/types";
import { logActivity } from "@/lib/db/repository";
import { MIN_ANALYSED_CARDS } from "@/lib/practice/calibrated-judge-constants";

export { MIN_ANALYSED_CARDS };
const BOOTSTRAP_DRAWS = 1000;
const SCORE_MIN = 1;
const SCORE_MAX = 10;

export type CalibratedJudgeView = {
  enough: boolean;
  message: string;
  n_cards: number;
  cruxy_mean: number | null;
  corrected_mean: number | null;
  ci_low: number | null;
  ci_high: number | null;
  overall_kappa: number | null;
  item_kappas: Record<string, number | null>;
};

type PairScores = {
  pairId: string;
  humanCardId: string;
  cruxyCardId: string;
  /** Per-item human score (missing items skipped). */
  human: Record<string, number>;
  cruxy: Record<string, number>;
};

/**
 * Store each human card beside Cruxy's card for the same round + team,
 * then refresh global item kappa and this round's snapshot.
 */
export async function syncCalibratedJudgeForRound(opts: {
  roundId: string;
  personId?: string | null;
}): Promise<CalibratedJudgeView[]> {
  const { cards, scores } = await listJudgeCards(opts.roundId);
  const humans = cards.filter((c) => !c.cruxy);
  const cruxies = cards.filter((c) => c.cruxy);

  // Analyse human cards first so pairs only count after real analysis.
  if (humans.length) {
    await ensureRoundCardAnalyses({
      roundId: opts.roundId,
      personId: opts.personId,
    });
  }

  for (const human of humans) {
    const analysis = await getAnalysisByCardId(human.id);
    const match =
      cruxies.find((c) => c.team_id === human.team_id) ?? cruxies[0];
    if (!match) continue;
    await upsertJudgeCardPair({
      round_id: opts.roundId,
      team_id: human.team_id,
      human_card_id: human.id,
      cruxy_card_id: match.id,
      analysis_id: analysis?.id ?? null,
    });
  }

  const views: CalibratedJudgeView[] = [];
  for (const cruxy of cruxies) {
    const view = await recomputeSnapshot({
      roundId: opts.roundId,
      cruxyCard: cruxy,
      allCards: cards,
      allScores: scores,
      personId: opts.personId,
    });
    views.push(view);
  }

  if (!cruxies.length) {
    views.push(notEnoughView(0));
  }

  await logActivity({
    person_id: opts.personId ?? null,
    action: "calibrated_judge_synced",
    target: opts.roundId,
    meta: { cruxyCards: cruxies.length, humanCards: humans.length },
  });

  return views;
}

/** Read snapshot for the report (pairs + kappa refreshed from real cards). */
export async function getCalibratedJudgeForReport(
  roundId: string,
): Promise<CalibratedJudgeView> {
  const views = await syncCalibratedJudgeForRound({ roundId });
  return views[0] ?? notEnoughView(0);
}

async function recomputeSnapshot(opts: {
  roundId: string;
  cruxyCard: JudgeCard;
  allCards: JudgeCard[];
  allScores: CardScore[];
  personId?: string | null;
}): Promise<CalibratedJudgeView> {
  const pairs = await listJudgeCardPairs();
  const usable = await loadUsablePairScores(pairs, opts.allCards, opts.allScores);

  // Per-item kappa over all analysed pairs (global).
  const itemKappas: Record<string, number | null> = {};
  for (const item of APPE_SCORE_ITEMS) {
    const human: number[] = [];
    const cruxy: number[] = [];
    for (const p of usable) {
      const h = p.human[item.key];
      const c = p.cruxy[item.key];
      if (h == null || c == null) continue;
      human.push(Math.round(h));
      cruxy.push(Math.round(c));
    }
    const kappa =
      human.length >= MIN_ANALYSED_CARDS
        ? cohenKappaQuadratic(human, cruxy, SCORE_MIN, SCORE_MAX)
        : null;
    itemKappas[item.key] = kappa;
    await upsertItemKappa({
      item: item.key,
      kappa,
      n_pairs: human.length,
    });
  }

  const overall = averageKappa(itemKappas);
  const nCards = usable.length;

  const cruxyScores = opts.allScores.filter(
    (s) => s.card_id === opts.cruxyCard.id,
  );
  const cruxyMean = meanScore(cruxyScores.map((s) => s.score));

  if (nCards < MIN_ANALYSED_CARDS || cruxyMean == null) {
    const view = notEnoughView(nCards);
    await upsertCalibratedSnapshot({
      round_id: opts.roundId,
      team_id: opts.cruxyCard.team_id,
      cruxy_card_id: opts.cruxyCard.id,
      cruxy_mean: cruxyMean,
      corrected_mean: null,
      ci_low: null,
      ci_high: null,
      overall_kappa: overall,
      n_cards: nCards,
      item_kappas: itemKappas,
      enough: false,
      message: view.message,
    });
    return { ...view, cruxy_mean: cruxyMean, overall_kappa: overall, item_kappas: itemKappas };
  }

  // Bias per pair: mean(human items) - mean(cruxy items) on shared items.
  const biases: number[] = [];
  for (const p of usable) {
    const keys = Object.keys(p.human).filter((k) => p.cruxy[k] != null);
    if (!keys.length) continue;
    const hMean = meanScore(keys.map((k) => p.human[k]!));
    const cMean = meanScore(keys.map((k) => p.cruxy[k]!));
    if (hMean == null || cMean == null) continue;
    biases.push(hMean - cMean);
  }

  const seed = hashSeed(`${opts.roundId}:${opts.cruxyCard.id}`);
  const { corrected, low, high } = bootstrapBiasCorrected({
    cruxyMean,
    biases,
    draws: BOOTSTRAP_DRAWS,
    seed,
  });

  const message = formatCalibratedMessage({
    corrected,
    low,
    high,
    kappa: overall,
    n: nCards,
  });

  const snapshot = await upsertCalibratedSnapshot({
    round_id: opts.roundId,
    team_id: opts.cruxyCard.team_id,
    cruxy_card_id: opts.cruxyCard.id,
    cruxy_mean: cruxyMean,
    corrected_mean: corrected,
    ci_low: low,
    ci_high: high,
    overall_kappa: overall,
    n_cards: nCards,
    item_kappas: itemKappas,
    enough: true,
    message,
  });

  return snapshotToView(snapshot);
}

async function loadUsablePairScores(
  pairs: Awaited<ReturnType<typeof listJudgeCardPairs>>,
  localCards: JudgeCard[],
  localScores: CardScore[],
): Promise<PairScores[]> {
  const out: PairScores[] = [];
  // Load scores for cards not in the current round via listJudgeCards per unique round.
  const scoresByCard = new Map<string, CardScore[]>();
  for (const s of localScores) {
    const arr = scoresByCard.get(s.card_id) ?? [];
    arr.push(s);
    scoresByCard.set(s.card_id, arr);
  }
  const localIds = new Set(localCards.map((c) => c.id));
  const missingRoundIds = [
    ...new Set(
      pairs
        .filter(
          (p) =>
            !localIds.has(p.human_card_id) || !localIds.has(p.cruxy_card_id),
        )
        .map((p) => p.round_id),
    ),
  ];
  for (const rid of missingRoundIds) {
    const remote = await listJudgeCards(rid);
    for (const s of remote.scores) {
      const arr = scoresByCard.get(s.card_id) ?? [];
      arr.push(s);
      scoresByCard.set(s.card_id, arr);
    }
  }

  for (const p of pairs) {
    const analysis = await getAnalysisByCardId(p.human_card_id);
    if (!analysis) continue;
    const use = analysis.effective_use;
    if (use !== "full" && use !== "reduced") continue;

    const hScores = scoresByCard.get(p.human_card_id) ?? [];
    const cScores = scoresByCard.get(p.cruxy_card_id) ?? [];
    if (!hScores.length || !cScores.length) continue;

    const human: Record<string, number> = {};
    const cruxy: Record<string, number> = {};
    for (const s of hScores) human[String(s.item)] = s.score;
    for (const s of cScores) cruxy[String(s.item)] = s.score;
    out.push({
      pairId: p.id,
      humanCardId: p.human_card_id,
      cruxyCardId: p.cruxy_card_id,
      human,
      cruxy,
    });
  }
  return out;
}

function notEnoughView(n: number): CalibratedJudgeView {
  return {
    enough: false,
    message: "Not enough human cards yet",
    n_cards: n,
    cruxy_mean: null,
    corrected_mean: null,
    ci_low: null,
    ci_high: null,
    overall_kappa: null,
    item_kappas: {},
  };
}

function snapshotToView(s: CalibratedJudgeSnapshotRow): CalibratedJudgeView {
  return {
    enough: s.enough,
    message: s.message,
    n_cards: s.n_cards,
    cruxy_mean: s.cruxy_mean,
    corrected_mean: s.corrected_mean,
    ci_low: s.ci_low,
    ci_high: s.ci_high,
    overall_kappa: s.overall_kappa,
    item_kappas: s.item_kappas ?? {},
  };
}

export function formatCalibratedMessage(opts: {
  corrected: number;
  low: number;
  high: number;
  kappa: number | null;
  n: number;
}): string {
  const mean = fmt1(opts.corrected);
  const lo = fmt1(opts.low);
  const hi = fmt1(opts.high);
  const kappa =
    opts.kappa == null ? "not set" : opts.kappa.toFixed(2);
  return `Cruxy ${mean} (${lo} to ${hi}), agreement with human judges: kappa ${kappa} over ${opts.n} cards`;
}

function fmt1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1);
}

function meanScore(vals: number[]): number | null {
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function averageKappa(
  itemKappas: Record<string, number | null>,
): number | null {
  const vals = Object.values(itemKappas).filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Quadratic-weighted Cohen's kappa for ordinal scores.
 * Chance-corrected; do not report raw exact-match rates.
 */
export function cohenKappaQuadratic(
  raterA: number[],
  raterB: number[],
  min: number,
  max: number,
): number | null {
  const n = Math.min(raterA.length, raterB.length);
  if (n === 0) return null;
  const cats = max - min + 1;
  if (cats < 2) return null;

  const matrix: number[][] = Array.from({ length: cats }, () =>
    Array.from({ length: cats }, () => 0),
  );
  for (let i = 0; i < n; i++) {
    const a = clampCat(raterA[i]!, min, max);
    const b = clampCat(raterB[i]!, min, max);
    matrix[a - min]![b - min]! += 1;
  }

  const weights: number[][] = Array.from({ length: cats }, (_, i) =>
    Array.from({ length: cats }, (_, j) => {
      const d = (i - j) / (cats - 1);
      return 1 - d * d;
    }),
  );

  let po = 0;
  let pe = 0;
  const row: number[] = Array(cats).fill(0);
  const col: number[] = Array(cats).fill(0);
  for (let i = 0; i < cats; i++) {
    for (let j = 0; j < cats; j++) {
      const cell = matrix[i]![j]!;
      row[i]! += cell;
      col[j]! += cell;
      po += weights[i]![j]! * cell;
    }
  }
  po /= n;
  for (let i = 0; i < cats; i++) {
    for (let j = 0; j < cats; j++) {
      pe += weights[i]![j]! * (row[i]! / n) * (col[j]! / n);
    }
  }
  if (Math.abs(1 - pe) < 1e-12) return po === 1 ? 1 : null;
  return (po - pe) / (1 - pe);
}

function clampCat(v: number, min: number, max: number): number {
  const r = Math.round(v);
  return Math.min(max, Math.max(min, r));
}

/** Bias-corrected Cruxy mean with percentile bootstrap CI. */
export function bootstrapBiasCorrected(opts: {
  cruxyMean: number;
  biases: number[];
  draws: number;
  seed: number;
}): { corrected: number; low: number; high: number } {
  const { cruxyMean, biases, draws, seed } = opts;
  if (!biases.length) {
    return { corrected: cruxyMean, low: cruxyMean, high: cruxyMean };
  }
  const meanBias = biases.reduce((a, b) => a + b, 0) / biases.length;
  const corrected = cruxyMean + meanBias;

  const samples: number[] = [];
  const rand = makeRng(seed);
  for (let d = 0; d < draws; d++) {
    let sum = 0;
    for (let i = 0; i < biases.length; i++) {
      const idx = Math.floor(rand() * biases.length);
      sum += biases[idx]!;
    }
    samples.push(cruxyMean + sum / biases.length);
  }
  samples.sort((a, b) => a - b);
  const lo = samples[Math.floor(0.025 * (samples.length - 1))]!;
  const hi = samples[Math.floor(0.975 * (samples.length - 1))]!;
  return { corrected, low: lo, high: hi };
}

function makeRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  const h = createHash("sha256").update(s).digest();
  return h.readUInt32BE(0);
}
