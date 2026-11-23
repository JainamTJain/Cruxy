import { NextResponse, after } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  advanceRoundPhase,
  getRecordingForRound,
  getRoundById,
  getTranscript,
} from "@/lib/db/practice-repository";
import {
  applyTranscriptQualityAfterFinalize,
  refreshCaseGlossary,
} from "@/lib/practice/glossary-extra";
import { finalizeRound } from "@/lib/practice/pipeline";
import { computeAndSaveTalkAnalytics } from "@/lib/practice/talk-analytics-extra";

export const maxDuration = 300;

function plainError(err: unknown): { error: string; stage: string; whatToDo: string } {
  const raw = err instanceof Error ? err.message : "Unknown error";
  const lower = raw.toLowerCase();
  if (lower.includes("assemblyai") || lower.includes("transcript")) {
    return {
      error: "Transcription failed.",
      stage: "transcribe",
      whatToDo:
        "Saved audio parts are kept. Tap Finish again in a minute. If it keeps failing, tell Jainam.",
    };
  }
  if (lower.includes("not found")) {
    return {
      error: "Round not found.",
      stage: "lookup",
      whatToDo: "Go back to Practice and open the round again.",
    };
  }
  return {
    error: "Could not finish this round.",
    stage: "finalize",
    whatToDo:
      "Saved audio parts are kept. Check your connection and tap Finish again.",
  };
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
  const round = await getRoundById(id);
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    forceCruxy?: boolean;
  };

  // Idempotent: already transcribed and audio deleted.
  try {
    const existingLines = await getTranscript(id);
    const existingRecording = await getRecordingForRound(id);
    if (
      existingLines.length > 0 &&
      existingRecording?.deleted_at &&
      (round.phase === "scoring" || round.phase === "done")
    ) {
      return NextResponse.json({
        ok: true,
        alreadyFinalized: true,
        audioDeleted: true,
        lineCount: existingLines.length,
        transcriptStub: false,
        cruxyCards: 0,
        teamsScored: [],
        reportId: null,
        glossaryAccuracy: null,
        uncertainCount: 0,
        correctionCount: 0,
        talkPeople: 0,
      });
    }
  } catch {
    /* continue into full finalize */
  }

  try {
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

    // The transcript is now part of the truth source: Cruxy re-reads each
    // team's working document against it and posts improvement suggestions.
    if (round.case_id && round.team_ids.length > 0) {
      const caseId = round.case_id;
      after(async () => {
        try {
          const { critiqueNow } = await import("@/lib/critique/run");
          await critiqueNow(
            round.team_ids.map((teamId) => ({ caseId, teamId })),
            session.personId,
            { onlyStartedDocs: true },
          );
        } catch {
          // Critique is best-effort; never fail the person's finalize for it.
        }
      });
    }

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
      whatToDo: result.transcriptStub
        ? "Live transcription was unavailable, so a stand-in transcript was used. Open the report, then ask a coach if you need a re-run."
        : undefined,
    });
  } catch (err) {
    const plain = plainError(err);
    return NextResponse.json(
      {
        ok: false,
        ...plain,
      },
      { status: 500 },
    );
  }
}
