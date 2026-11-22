import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  advanceRoundPhase,
  getRecordingForRound,
  getRoundById,
  getSpeakerConfirm,
  getTranscript,
  listJudgeCards,
  startRound,
} from "@/lib/db/practice-repository";
import { getReportExtras } from "@/lib/db/supabase/practice-extra";
import { getPersonById } from "@/lib/db/repository";
import { sessionHasTextOnlyMembers } from "@/lib/attendance";
import { isAdminRole } from "@/lib/admin/permissions";
import {
  isAdminViewer,
  redactPredictions,
} from "@/lib/ops/privacy-scope";
import type { RoundPhase } from "@/lib/practice/types";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const round = await getRoundById(id);
  if (!round) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const recording = await getRecordingForRound(id);
  const lines = await getTranscript(id);
  const speakers = await getSpeakerConfirm(id);
  const { cards, scores } = await listJudgeCards(id);
  const extras = await getReportExtras(id);
  const me = await getPersonById(session.personId);
  const textOnlyBanner = await sessionHasTextOnlyMembers(round.session_id);
  const caseTitle =
    extras.teams && round.case_number != null
      ? `Case ${round.case_number}`
      : null;
  const admin = isAdminViewer(me, session);
  const coachOrTech = Boolean(me && isAdminRole(me.role));
  const safeCards = cards.map((c) =>
    redactPredictions(c, {
      viewerPersonId: session.personId,
      adminViewer: admin,
      coachOrTech,
    }),
  );

  return NextResponse.json({
    round,
    recording: recording
      ? {
          id: recording.id,
          status: recording.status,
          chunks: recording.chunk_meta.length,
          deleted_at: recording.deleted_at,
        }
      : null,
    lines,
    speakers,
    cards: safeCards,
    scores,
    people: extras.people,
    teams: extras.teams,
    judges: extras.judges,
    caseLabel: caseTitle,
    recordingOk: Boolean(me?.recording_ok),
    consentVersion: me?.consent_version ?? null,
    textOnlyBanner,
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
  const body = (await req.json()) as { action?: string; phase?: RoundPhase };
  if (body.action === "start") {
    const { assertPredictionsReady } = await import(
      "@/lib/practice/predictions"
    );
    const gate = await assertPredictionsReady(id);
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.reason, missing: gate.missing },
        { status: 400 },
      );
    }
    const round = await startRound(id);
    return NextResponse.json({ round });
  }
  if (body.action === "phase" && body.phase) {
    const round = await advanceRoundPhase(id, body.phase);
    return NextResponse.json({ round });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
