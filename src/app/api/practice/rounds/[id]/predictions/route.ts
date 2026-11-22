import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getRoundById } from "@/lib/db/practice-repository";
import { getPersonById, listPeopleFull } from "@/lib/db/repository";
import { isAdminRole } from "@/lib/admin/permissions";
import { isAdminViewer } from "@/lib/ops/privacy-scope";
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
  if (!round) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const mine =
    predictions.find((p) => p.person_id === session.personId) ?? null;
  const teamIds = new Set(
    [
      round.sides.presenting,
      round.sides.commenting,
      ...(round.team_ids ?? []),
    ].filter((x): x is string => Boolean(x)),
  );
  const onRound = Boolean(
    (me?.team_id && teamIds.has(me.team_id)) ||
      round.created_by === session.personId ||
      gate.speakers.some((s) => s.id === session.personId),
  );
  const canPredict = onRound;
  const admin = isAdminViewer(me, session);
  // Decisions: score predictions visible to the person, Dr. B and Jainam.
  const coachOrTech = Boolean(me && isAdminRole(me.role));

  // Who still needs to predict is visible to round participants and admins
  // (needed to start the round), not to arbitrary members with a round id.
  if (!admin && !coachOrTech && !onRound) {
    return NextResponse.json({
      gate: {
        ready: gate.ready,
        speakers: [],
        missing: [],
      },
      mine: null,
      canPredict: false,
      predictedCount: predictions.length,
    });
  }

  let coachPredictions:
    | {
        id: string;
        person_id: string;
        person_name: string | null;
        item_scores: (typeof predictions)[number]["item_scores"];
        expected_question: string;
        created_at: string;
      }[]
    | undefined;
  if (coachOrTech) {
    const people = await listPeopleFull();
    const names = new Map(people.map((p) => [p.id, p.name]));
    coachPredictions = predictions.map((p) => ({
      id: p.id,
      person_id: p.person_id,
      person_name: names.get(p.person_id) ?? null,
      item_scores: p.item_scores,
      expected_question: p.expected_question,
      created_at: p.created_at,
    }));
  }

  return NextResponse.json({
    gate,
    mine,
    canPredict,
    predictedPersonIds: predictions.map((p) => p.person_id),
    // Full item scores for Dr. B / Jainam (and self via mine).
    ...(coachOrTech ? { predictions: coachPredictions } : {}),
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
