import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getRoundById,
  saveDrillCheckpoint,
} from "@/lib/db/practice-repository";
import type { DrillCheckpoint } from "@/lib/practice/types";

/** Save mid-drill UI state so leave/return resumes the same round. */
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
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (round.created_by && round.created_by !== session.personId) {
    // Member drills are owned by the starter; team rounds may share.
    if (round.mode !== "full_round") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const body = (await req.json()) as DrillCheckpoint;
  const saved = await saveDrillCheckpoint(id, {
    phase: typeof body.phase === "string" ? body.phase : undefined,
    prompt: body.prompt ?? null,
    seconds_left:
      typeof body.seconds_left === "number" ? body.seconds_left : null,
    running: typeof body.running === "boolean" ? body.running : undefined,
  });
  if (!saved) {
    return NextResponse.json({ error: "Could not save" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, checkpoint: saved.drill_checkpoint });
}

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
  return NextResponse.json({
    checkpoint: round.drill_checkpoint ?? null,
    phase: round.phase,
    phaseEnteredAt: round.phase_entered_at ?? null,
  });
}
