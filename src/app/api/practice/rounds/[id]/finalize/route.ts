import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { advanceRoundPhase, getRoundById } from "@/lib/db/practice-repository";
import {
  applyTranscriptQualityAfterFinalize,
  refreshCaseGlossary,
} from "@/lib/practice/glossary-extra";
import { finalizeRound } from "@/lib/practice/pipeline";
import { computeAndSaveTalkAnalytics } from "@/lib/practice/talk-analytics-extra";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const round = await getRoundById(id);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    forceCruxy?: boolean;
  };

  // F-226: enrich glossary before transcription key terms are sent.
  if (round.case_id) {
    await refreshCaseGlossary({
      caseId: round.case_id,
      personId: session.personId,
    });
  }

  const result = await finalizeRound({
    roundId: id,
    personId: session.personId,
    forceCruxy: body.forceCruxy,
  });

  // F-228 / F-231: correction pass, uncertain flags, accuracy estimate.
  const quality = await applyTranscriptQualityAfterFinalize({
    roundId: id,
    personId: session.personId,
  });

  // F-234: talk analytics per person.
  const talk = await computeAndSaveTalkAnalytics({
    roundId: id,
    personId: session.personId,
  });

  await advanceRoundPhase(id, "scoring");

  return NextResponse.json({
    ok: true,
    audioDeleted: Boolean(result.recording.deleted_at),
    lineCount: result.lines.length,
    transcriptStub: result.transcriptStub,
    cruxyCards: result.judgment?.cards.length ?? 0,
    teamsScored: result.judgment?.cards.map((c) => c.team_id) ?? [],
    reportId: result.judgment?.report.id ?? null,
    glossaryAccuracy: quality.accuracy,
    uncertainCount: quality.uncertain_count,
    correctionCount: quality.correction_count,
    talkPeople: talk.length,
  });
}
