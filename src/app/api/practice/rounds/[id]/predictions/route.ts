import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getRoundById } from "@/lib/db/practice-repository";
import { getPersonById } from "@/lib/db/repository";
import type { AppeItemKey, ItemPredictionInput } from "@/lib/practice/types";
import {
  getPredictionGate,
  listPredictionsForRound,
  saveRoundPrediction,
} from "@/lib/practice/predictions";

/** Wave 6: required score predictions before a round can start. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const [gate, predictions, round, me] = await Promise.all([
    getPredictionGate(id),
    listPredictionsForRound(id),
    getRoundById(id),
    getPersonById(session.personId),
  ]);
  const mine = predictions.find((p) => p.person_id === session.personId) ?? null;
  const teamIds = new Set(
    [
      round?.sides.presenting,
      round?.sides.commenting,
      ...(round?.team_ids ?? []),
    ].filter((x): x is string => Boolean(x)),
  );
  const canPredict = Boolean(
    (me?.team_id && teamIds.has(me.team_id)) ||
      round?.created_by === session.personId ||
      gate.speakers.some((s) => s.id === session.personId),
  );
  return NextResponse.json({
    gate,
    mine,
    canPredict,
    // Speakers see who still needs to predict; item scores stay private.
    predictedPersonIds: predictions.map((p) => p.person_id),
  });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = (await req.json()) as {
    itemScores?: Partial<Record<AppeItemKey, ItemPredictionInput>>;
    expectedQuestion?: string;
  };
  if (!body.itemScores || typeof body.expectedQuestion !== "string") {
    return NextResponse.json(
      { error: "itemScores and expectedQuestion required" },
      { status: 400 },
    );
  }
  const result = await saveRoundPrediction({
    roundId: id,
    personId: session.personId,
    itemScores: body.itemScores,
    expectedQuestion: body.expectedQuestion,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }
  const gate = await getPredictionGate(id);
  return NextResponse.json({ prediction: result.prediction, gate });
}
