import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import { canAccessSoloRecording } from "@/lib/team/solo-prep-access";
import {
  getSoloRecording,
  listReviewComments,
} from "@/lib/team/solo-prep-repository";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const recording = await getSoloRecording(id);
  if (!recording) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (
    !canAccessSoloRecording({
      person,
      session,
      recordingTeamId: recording.team_id,
    })
  ) {
    return NextResponse.json(
      { error: "You can only open reviews for your own team." },
      { status: 403 },
    );
  }
  const comments = await listReviewComments(id);
  return NextResponse.json({
    recording,
    comments,
    meId: person.id,
  });
}
