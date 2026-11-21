import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { advanceRoundPhase, getRoundById } from "@/lib/db/practice-repository";
import { finalizeRound } from "@/lib/practice/pipeline";

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

  const result = await finalizeRound({
    roundId: id,
    personId: session.personId,
    forceCruxy: body.forceCruxy,
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
  });
}
