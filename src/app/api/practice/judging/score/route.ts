import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  findJudgeCard,
  getRoundById,
  getTranscript,
  listJudgeCards,
  resolveGuestToken,
  saveJudgeCard,
  upsertJudge,
} from "@/lib/db/practice-repository";
import { analyseHumanCard } from "@/lib/practice/judge-card-analysis";
import { syncCalibratedJudgeForRound } from "@/lib/practice/calibrated-judge";
import { validateEvidence } from "@/lib/practice/appe-card";
import type { AppeItemKey, CardScore, JudgeCard } from "@/lib/practice/types";
import { nowIso } from "@/lib/utils";
import { logActivity } from "@/lib/db/repository";

export async function POST(req: Request) {
  const session = await getSession();
  let body: {
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
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

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

  // Peer / member path without judgeId: create or reuse a judge row for this person.
  if (!judgeId && session) {
    const judge = await upsertJudge({
      name: session.name,
      background: body.peer
        ? "Peer judge (team member)"
        : "USC Ethics Bowl member",
      personId: session.personId,
    });
    judgeId = judge.id;
  }

  if (!judgeId) {
    return NextResponse.json({ error: "Judge required" }, { status: 400 });
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
  if (!round.team_ids.includes(body.teamId)) {
    return NextResponse.json(
      { error: "That team is not on this round." },
      { status: 403 },
    );
  }

  // Peer judging: round should have a transcript (or at least be ended).
  if (body.peer && !round.ended_at) {
    const linesEarly = await getTranscript(body.roundId);
    if (linesEarly.length === 0) {
      return NextResponse.json(
        {
          error:
            "Peer judging waits until the round has a transcript. Try again after the round ends.",
        },
        { status: 409 },
      );
    }
  }

  const lines = await getTranscript(body.roundId);
  const at = nowIso();

  // Idempotent: same judge + team + round updates the existing card.
  const existing = await findJudgeCard({
    roundId: body.roundId,
    teamId: body.teamId,
    judgeId,
    cruxy: false,
  });

  const card: JudgeCard = {
    id: existing?.id ?? randomUUID(),
    round_id: body.roundId,
    judge_id: judgeId,
    cruxy: false,
    team_id: body.teamId,
    spirit: body.spirit ?? null,
    spirit_comment: body.spiritComment ?? null,
    overall_comment: body.overallComment ?? null,
    moments: body.moments ?? existing?.moments ?? [],
    predictions: body.predictions ?? existing?.predictions ?? null,
    calibration_note: existing?.calibration_note ?? null,
    calibration_use: existing?.calibration_use ?? null,
    created_at: existing?.created_at ?? at,
    created_by: existing?.created_by ?? session?.personId ?? null,
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

  // Persist first so a lost connection after save still keeps scores.
  await saveJudgeCard(card, scores, { replaceScores: true });

  let analysisNote: string | null = null;
  let analysisUse: JudgeCard["calibration_use"] = null;
  let analysisWarning: string | null = null;

  try {
    const all = await listJudgeCards(body.roundId);
    // Peer cards from competing teams still count as conflict for calibration.
    const competingTeamMember = Boolean(
      session?.teamId && round.team_ids.includes(session.teamId),
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

    analysisNote = bundle.analysis.overall_note;
    analysisUse = bundle.analysis.effective_use;
    card.calibration_note = analysisNote;
    card.calibration_use = analysisUse;
    await saveJudgeCard(card, scores);

    await syncCalibratedJudgeForRound({
      roundId: body.roundId,
      personId: session?.personId ?? null,
    });

    const { computeBrierAfterJudging } = await import(
      "@/lib/practice/predictions"
    );
    await computeBrierAfterJudging({ roundId: body.roundId });
  } catch {
    // Card already saved; analysis can be retried. Do not fail the submit.
    analysisWarning =
      "Card saved. Calibration analysis will catch up shortly.";
  }

  await logActivity({
    person_id: session?.personId ?? null,
    action: body.peer ? "peer_judge_card" : "judge_card_submitted",
    target: body.roundId,
    meta: {
      teamId: body.teamId,
      use: analysisUse,
      updated: Boolean(existing),
    },
  });

  const all = await listJudgeCards(body.roundId);

  return NextResponse.json({
    card: {
      ...card,
      calibration_note: undefined,
      calibration_use: undefined,
    },
    scores,
    cardsArrived: all.cards.length,
    updated: Boolean(existing),
    warning: analysisWarning,
  });
}
