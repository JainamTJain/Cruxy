/**
 * Wave 6: required score predictions before a round can start,
 * and personal Brier scores after judging.
 */
import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import {
  getRoundById,
  listAttendance,
  listJudgeCards,
} from "@/lib/db/practice-repository";
import { listPeopleFull, logActivity } from "@/lib/db/repository";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { applicableItems } from "@/lib/practice/appe-card";
import {
  bandHit,
  calibrationBuckets,
  clampConfidence,
  meanBrier,
  normalizeItemPrediction,
} from "@/lib/practice/brier";
import type {
  AppeItemKey,
  ItemPrediction,
  ItemPredictionInput,
  PracticeRound,
  PredictionBrierScore,
  RoundScorePrediction,
} from "@/lib/practice/types";
import { nowIso } from "@/lib/utils";

type PredBag = {
  round_score_predictions?: RoundScorePrediction[];
  prediction_brier_scores?: PredictionBrierScore[];
};

function scoredItemsForRound(round: PracticeRound): AppeItemKey[] {
  return applicableItems({
    hasCommentingTeam: Boolean(round.sides.commenting),
    hasJudgesQa: true,
  }).scored;
}

/** Speakers who must predict before the round starts. */
export async function listSpeakersForRound(
  roundId: string,
): Promise<{ id: string; name: string; team_id: string | null }[]> {
  const round = await getRoundById(roundId);
  if (!round) return [];
  const people = await listPeopleFull();
  const teamIds = new Set(
    [round.sides.presenting, round.sides.commenting, ...round.team_ids].filter(
      (x): x is string => Boolean(x),
    ),
  );
  const onTeam = people.filter((p) => p.team_id && teamIds.has(p.team_id));

  const attendance = await listAttendance(round.session_id);
  const present = new Set(
    attendance
      .filter((a) => a.status === "present" || a.status === "late")
      .map((a) => a.person_id),
  );

  let speakers = onTeam;
  if (present.size > 0) {
    const filtered = onTeam.filter((p) => present.has(p.id));
    if (filtered.length) speakers = filtered;
  } else if (round.created_by) {
    // No roll call yet: require the starter (and anyone else who already predicted).
    const creator = onTeam.find((p) => p.id === round.created_by);
    speakers = creator ? [creator] : onTeam.slice(0, 1);
  }

  if (!speakers.length && round.created_by) {
    const creator = people.find((p) => p.id === round.created_by);
    if (creator) speakers = [creator];
  }

  return speakers.map((p) => ({
    id: p.id,
    name: p.name,
    team_id: p.team_id,
  }));
}

export async function listPredictionsForRound(
  roundId: string,
): Promise<RoundScorePrediction[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const bag = store as PredBag;
    return (bag.round_score_predictions ?? []).filter(
      (p) => p.round_id === roundId,
    );
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("round_score_predictions")
    .select("*")
    .eq("round_id", roundId);
  if (error) throw new Error(`listPredictions: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(mapPrediction);
}

function mapPrediction(r: Record<string, unknown>): RoundScorePrediction {
  return {
    id: String(r.id),
    round_id: String(r.round_id),
    person_id: String(r.person_id),
    item_scores: (r.item_scores as RoundScorePrediction["item_scores"]) ?? {},
    expected_question: String(r.expected_question ?? ""),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at ?? r.created_at),
  };
}

export async function getPredictionGate(roundId: string): Promise<{
  ready: boolean;
  speakers: { id: string; name: string; predicted: boolean }[];
  missing: string[];
  requiredItems: AppeItemKey[];
}> {
  const round = await getRoundById(roundId);
  if (!round) {
    return { ready: false, speakers: [], missing: [], requiredItems: [] };
  }
  const requiredItems = scoredItemsForRound(round);
  const speakers = await listSpeakersForRound(roundId);
  const preds = await listPredictionsForRound(roundId);
  const byPerson = new Map(preds.map((p) => [p.person_id, p]));

  const rows = speakers.map((s) => {
    const p = byPerson.get(s.id);
    const complete =
      Boolean(p) &&
      Boolean(p!.expected_question.trim()) &&
      requiredItems.every((k) => normalizeItemPrediction(p!.item_scores[k]));
    return { id: s.id, name: s.name, predicted: complete };
  });

  const missing = rows.filter((r) => !r.predicted).map((r) => r.name);
  return {
    ready: rows.length > 0 ? missing.length === 0 : true,
    speakers: rows,
    missing,
    requiredItems,
  };
}

export async function saveRoundPrediction(opts: {
  roundId: string;
  personId: string;
  itemScores: Partial<Record<AppeItemKey, ItemPredictionInput>>;
  expectedQuestion: string;
}): Promise<
  | { ok: true; prediction: RoundScorePrediction }
  | { ok: false; reason: string }
> {
  const round = await getRoundById(opts.roundId);
  if (!round) return { ok: false, reason: "Round not found" };
  if (round.phase !== "setup") {
    return { ok: false, reason: "Predictions lock once the round starts" };
  }

  const people = await listPeopleFull();
  const teamIds = new Set(
    [
      round.sides.presenting,
      round.sides.commenting,
      ...round.team_ids,
    ].filter((x): x is string => Boolean(x)),
  );
  const me = people.find((p) => p.id === opts.personId);
  const onTeam = Boolean(me?.team_id && teamIds.has(me.team_id));
  const isCreator = round.created_by === opts.personId;
  if (!onTeam && !isCreator) {
    return { ok: false, reason: "Only speakers for this round predict" };
  }

  const required = scoredItemsForRound(round);
  const item_scores: Partial<Record<AppeItemKey, ItemPrediction>> = {};
  for (const key of required) {
    const normalized = normalizeItemPrediction(opts.itemScores[key]);
    if (!normalized) {
      return { ok: false, reason: `Predict every item (${key})` };
    }
    item_scores[key] = normalized;
  }
  const q = opts.expectedQuestion.trim();
  if (q.length < 8) {
    return {
      ok: false,
      reason: "Write the judge question you expect (a full sentence)",
    };
  }

  const at = nowIso();

  let prediction: RoundScorePrediction;

  if (isSampleDataMode()) {
    let id: string = randomUUID();
    await updateStore((s) => {
      const bag = s as PredBag;
      if (!bag.round_score_predictions) bag.round_score_predictions = [];
      const i = bag.round_score_predictions.findIndex(
        (p) => p.round_id === opts.roundId && p.person_id === opts.personId,
      );
      if (i >= 0) {
        const prev = bag.round_score_predictions[i]!;
        id = prev.id;
        bag.round_score_predictions[i] = {
          ...prev,
          item_scores,
          expected_question: q,
          updated_at: at,
        };
      } else {
        bag.round_score_predictions.push({
          id,
          round_id: opts.roundId,
          person_id: opts.personId,
          item_scores,
          expected_question: q,
          created_at: at,
          updated_at: at,
        });
      }
    });
    prediction = {
      id,
      round_id: opts.roundId,
      person_id: opts.personId,
      item_scores,
      expected_question: q,
      created_at: at,
      updated_at: at,
    };
  } else {
    const sb = getServiceSupabase();
    const { data, error } = await sb
      .from("round_score_predictions")
      .upsert(
        {
          round_id: opts.roundId,
          person_id: opts.personId,
          item_scores,
          expected_question: q,
          updated_at: at,
        },
        { onConflict: "round_id,person_id" },
      )
      .select("*")
      .single();
    if (error) throw new Error(`saveRoundPrediction: ${error.message}`);
    prediction = mapPrediction(data as Record<string, unknown>);
  }

  await logActivity({
    person_id: opts.personId,
    action: "score_prediction_saved",
    target: opts.roundId,
    meta: { items: required.length },
  });

  return { ok: true, prediction };
}

/** Block start until every speaker has predicted. */
export async function assertPredictionsReady(
  roundId: string,
): Promise<{ ok: true } | { ok: false; reason: string; missing: string[] }> {
  const gate = await getPredictionGate(roundId);
  if (gate.ready) return { ok: true };
  return {
    ok: false,
    reason: `Waiting on predictions from: ${gate.missing.join(", ")}`,
    missing: gate.missing,
  };
}

export async function listMyBrierTrend(
  personId: string,
  limit = 20,
): Promise<PredictionBrierScore[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const bag = store as PredBag;
    return (bag.prediction_brier_scores ?? [])
      .filter((b) => b.person_id === personId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("prediction_brier_scores")
    .select("*")
    .eq("person_id", personId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`listMyBrierTrend: ${error.message}`);
  return (data ?? []).map((r) => mapBrier(r as Record<string, unknown>));
}

function mapBrier(r: Record<string, unknown>): PredictionBrierScore {
  return {
    id: String(r.id),
    person_id: String(r.person_id),
    round_id: String(r.round_id),
    brier: Number(r.brier),
    item_briers:
      (r.item_briers as PredictionBrierScore["item_briers"]) ?? {},
    predicted_mean:
      r.predicted_mean == null ? null : Number(r.predicted_mean),
    actual_mean: r.actual_mean == null ? null : Number(r.actual_mean),
    created_at: String(r.created_at),
  };
}

/**
 * After judging: compare each speaker's prediction to the mean of
 * Cruxy + human scores for their presenting/commenting team.
 */
export async function computeBrierAfterJudging(opts: {
  roundId: string;
}): Promise<{ computed: number }> {
  const round = await getRoundById(opts.roundId);
  if (!round) return { computed: 0 };

  const preds = await listPredictionsForRound(opts.roundId);
  if (!preds.length) return { computed: 0 };

  const { cards, scores } = await listJudgeCards(opts.roundId);
  const required = scoredItemsForRound(round);
  const people = await listPeopleFull();
  let computed = 0;

  for (const pred of preds) {
    const person = people.find((p) => p.id === pred.person_id);
    const teamId =
      person?.team_id &&
      (person.team_id === round.sides.presenting ||
        person.team_id === round.sides.commenting ||
        round.team_ids.includes(person.team_id))
        ? person.team_id
        : round.sides.presenting ?? round.team_ids[0] ?? null;
    if (!teamId) continue;

    const teamCards = cards.filter((c) => c.team_id === teamId);
    const pairs: {
      predicted: number;
      actual: number;
      confidence: number;
      item: AppeItemKey;
    }[] = [];
    for (const item of required) {
      const normalized = normalizeItemPrediction(pred.item_scores[item]);
      if (!normalized) continue;
      const itemScores = scores.filter(
        (s) =>
          s.item === item && teamCards.some((c) => c.id === s.card_id),
      );
      if (!itemScores.length) continue;
      const actual =
        itemScores.reduce((sum, s) => sum + s.score, 0) / itemScores.length;
      pairs.push({
        predicted: normalized.score,
        actual,
        confidence: normalized.confidence,
        item,
      });
    }
    if (!pairs.length) continue;

    const result = meanBrier(pairs);
    if (result.brier == null) continue;
    const at = nowIso();
    const row: PredictionBrierScore = {
      id: randomUUID(),
      person_id: pred.person_id,
      round_id: opts.roundId,
      brier: result.brier,
      item_briers: result.item_briers,
      predicted_mean: result.predicted_mean,
      actual_mean: result.actual_mean,
      created_at: at,
    };

    if (isSampleDataMode()) {
      await updateStore((s) => {
        const bag = s as PredBag;
        if (!bag.prediction_brier_scores) bag.prediction_brier_scores = [];
        const i = bag.prediction_brier_scores.findIndex(
          (b) => b.person_id === row.person_id && b.round_id === row.round_id,
        );
        if (i >= 0) bag.prediction_brier_scores[i] = { ...row, id: bag.prediction_brier_scores[i]!.id };
        else bag.prediction_brier_scores.push(row);
      });
    } else {
      const sb = getServiceSupabase();
      const { error } = await sb.from("prediction_brier_scores").upsert(
        {
          person_id: row.person_id,
          round_id: row.round_id,
          brier: row.brier,
          item_briers: row.item_briers,
          predicted_mean: row.predicted_mean,
          actual_mean: row.actual_mean,
        },
        { onConflict: "person_id,round_id" },
      );
      if (error) throw new Error(`computeBrier: ${error.message}`);
    }

    await logActivity({
      person_id: pred.person_id,
      action: "prediction_brier_computed",
      target: opts.roundId,
      meta: { brier: result.brier },
    });
    computed += 1;
  }

  return { computed };
}

async function listPredictionsForPerson(
  personId: string,
): Promise<RoundScorePrediction[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const bag = store as PredBag;
    return (bag.round_score_predictions ?? []).filter(
      (p) => p.person_id === personId,
    );
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("round_score_predictions")
    .select("*")
    .eq("person_id", personId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(`listPredictionsForPerson: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(mapPrediction);
}

/**
 * Stated confidence vs how often the predicted band actually hit.
 * Personal only. Needs enough scored rounds before rates are meaningful.
 */
export async function getPersonalCalibration(personId: string): Promise<{
  buckets: {
    confidence: number;
    n: number;
    hitRate: number | null;
  }[];
  sampleCount: number;
  enough: boolean;
}> {
  const preds = await listPredictionsForPerson(personId);
  const people = await listPeopleFull();
  const person = people.find((p) => p.id === personId);
  const samples: { confidence: number; hit: boolean }[] = [];

  for (const pred of preds) {
    const round = await getRoundById(pred.round_id);
    if (!round) continue;
    const { cards, scores } = await listJudgeCards(pred.round_id);
    if (!cards.length) continue;
    const teamId =
      person?.team_id &&
      (person.team_id === round.sides.presenting ||
        person.team_id === round.sides.commenting ||
        round.team_ids.includes(person.team_id))
        ? person.team_id
        : round.sides.presenting ?? round.team_ids[0] ?? null;
    if (!teamId) continue;
    const teamCards = cards.filter((c) => c.team_id === teamId);
    const required = scoredItemsForRound(round);
    for (const item of required) {
      const normalized = normalizeItemPrediction(pred.item_scores[item]);
      if (!normalized) continue;
      const itemScores = scores.filter(
        (s) =>
          s.item === item && teamCards.some((c) => c.id === s.card_id),
      );
      if (!itemScores.length) continue;
      const actual =
        itemScores.reduce((sum, s) => sum + s.score, 0) / itemScores.length;
      samples.push({
        confidence: clampConfidence(normalized.confidence),
        hit: bandHit(normalized.score, actual),
      });
    }
  }

  return {
    buckets: calibrationBuckets(samples),
    sampleCount: samples.length,
    /** Rough floor before the chart is worth reading. */
    enough: samples.length >= 8,
  };
}
