import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getRoundById } from "@/lib/db/practice-repository";
import { assertRecordingLayoutAllowed } from "@/lib/ops/consent-recording";
import type { RecordingLayout } from "@/lib/practice/types";
import { setRoundRecordingLayout } from "@/lib/practice/wave5";

const LAYOUTS: RecordingLayout[] = ["room", "own_device", "mixed"];

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = (await req.json()) as { layout?: string };
  if (!body.layout || !LAYOUTS.includes(body.layout as RecordingLayout)) {
    return NextResponse.json({ error: "layout required" }, { status: 400 });
  }
  const existing = await getRoundById(id);
  if (!existing) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  const layout = body.layout as RecordingLayout;
  const allowed = await assertRecordingLayoutAllowed({
    sessionId: existing.session_id,
    layout,
  });
  if (!allowed.ok) {
    return NextResponse.json({ error: allowed.reason }, { status: 403 });
  }
  const round = await setRoundRecordingLayout({
    roundId: id,
    layout,
    actorId: session.personId,
  });
  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  return NextResponse.json({ round });
}
