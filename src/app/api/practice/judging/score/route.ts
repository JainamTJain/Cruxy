import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getRoundById,
  getTranscript,
  listJudgeCards,
  resolveGuestToken,
  saveJudgeCard,
} from "@/lib/db/practice-repository";
import { analyseHumanCard } from "@/lib/practice/judge-card-analysis";
import { syncCalibratedJudgeForRound } from "@/lib/practice/calibrated-judge";
import { validateEvidence } from "@/lib/practice/appe-card";
import type { AppeItemKey, CardScore, JudgeCard } from "@/lib/practice/types";
import { nowIso } from "@/lib/utils";
import { logActivity } from "@/lib/db/repository";

export async function POST(req: Request) {
  const session = await getSession();
  const body = (await req.json()) as {
    roundId?: string;
    judgeId?: string;
    guestToken?: string;
    teamId?: string;
    scores?: {
      item: AppeItemKey;
      score: number;
      comment?: string;
      evidenceLineIds?: string[];
    }[];
    spirit?: number;
    spiritComment?: string;
    overallComment?: string;
    moments?: { line_id: string; note: string }[];
    predictions?: Record<string, number>;
    peer?: boolean;
  };

  if (!body.roundId || !body.teamId || !body.scores?.length) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  let judgeId = body.judgeId ?? null;
  let guestMode = false;
  if (body.guestToken) {
    const guest = await resolveGuestToken(body.guestToken);
    if (!guest || guest.roundId !== body.roundId) {
      return NextResponse.json(
        { error: "Guest link expired or invalid" },
        { status: 403 },
      );
    }
    judgeId = guest.judge.id;
    guestMode = true;
  }

  if (!judgeId && !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const round = await getRoundById(body.roundId);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  if (guestMode && round.session?.status === "ended") {
    return NextResponse.json(
      { error: "This session has ended. Guest scoring is closed." },
      { status: 403 },
    );
  }
  // Guests may only score teams on their assigned round card.
  if (guestMode && !round.team_ids.includes(body.teamId)) {
    return NextResponse.json(
      { error: "That team is not on this round." },
      { status: 403 },
    );
  }

  const lines = await getTranscript(body.roundId);
  const at = nowIso();
  const card: JudgeCard = {
    id: randomUUID(),
    round_id: body.roundId,
    judge_id: judgeId,
    cruxy: false,
    team_id: body.teamId,
    spirit: body.spirit ?? null,
    spirit_comment: body.spiritComment ?? null,
    overall_comment: body.overallComment ?? null,
    moments: body.moments ?? [],
    predictions: body.predictions ?? null,
    calibration_note: null,
    calibration_use: null,
    created_at: at,
    created_by: session?.personId ?? null,
  };

  const scores: CardScore[] = [];
  for (const s of body.scores) {
    const check = validateEvidence(
      {
        score: s.score,
        comment: s.comment ?? null,
        evidence_line_ids: s.evidenceLineIds ?? [],
      },
      false,
    );
    if (!check.ok) {
      return NextResponse.json({ error: check.reason }, { status: 400 });
    }
    scores.push({
      id: randomUUID(),
      card_id: card.id,
      item: s.item,
      score: s.score,
      comment: s.comment ?? null,
      evidence_line_ids: s.evidenceLineIds ?? [],
      created_at: at,
    });
  }

  await saveJudgeCard(card, scores);

  const all = await listJudgeCards(body.roundId);
  const competingTeamMember = Boolean(
    session?.teamId &&
      round.team_ids.includes(session.teamId) &&
      !body.peer,
  );
  const peers = all.cards.filter((c) => !c.cruxy && c.id !== card.id);
  const bundle = await analyseHumanCard({
    card,
    scores,
    lines,
    peerCards: peers,
    peerScores: all.scores.filter((s) =>
      peers.some((p) => p.id === s.card_id),
    ),
    priorCardsForJudge: all.cards.filter(
      (c) =>
        !c.cruxy &&
        c.judge_id &&
        c.judge_id === card.judge_id &&
        c.id !== card.id,
    ),
    judge: null,
    competingTeamMember,
    arguedThisCase: false,
    personId: session?.personId ?? null,
  });

  card.calibration_note = bundle.analysis.overall_note;
  card.calibration_use = bundle.analysis.effective_use;
  await saveJudgeCard(card, scores);

  // Wave 6 C: pair this human card with Cruxy's card and refresh kappa.
  await syncCalibratedJudgeForRound({
    roundId: body.roundId,
    personId: session?.personId ?? null,
  });

  await logActivity({
    person_id: session?.personId ?? null,
    action: body.peer ? "peer_judge_card" : "judge_card_submitted",
    target: body.roundId,
    meta: { teamId: body.teamId, use: bundle.analysis.effective_use },
  });

  // Wave 6: refresh personal Brier when human cards arrive.
  const { computeBrierAfterJudging } = await import(
    "@/lib/practice/predictions"
  );
  await computeBrierAfterJudging({ roundId: body.roundId });

  return NextResponse.json({
    card: {
      ...card,
      // F-265: members never see calibration internals
      calibration_note: undefined,
      calibration_use: undefined,
    },
    scores,
    cardsArrived: all.cards.length,
  });
}
