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
  return NextResponse.json({
    round,
    recording: recording
      ? {
          id: recording.id,
          status: recording.status,
          chunks: recording.chunk_meta.length,
          deleted_at: recording.deleted_at,
          // never return chunk paths to client
        }
      : null,
    lines,
    speakers,
    cards,
    scores,
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
    const round = await startRound(id);
    return NextResponse.json({ round });
  }
  if (body.action === "phase" && body.phase) {
    const round = await advanceRoundPhase(id, body.phase);
    return NextResponse.json({ round });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
