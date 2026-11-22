import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import { canAccessSoloRecording } from "@/lib/team/solo-prep-access";
import {
  addReviewComment,
  getSoloRecording,
  listReviewComments,
} from "@/lib/team/solo-prep-repository";

export const runtime = "nodejs";

async function assertRecordingAccess(
  person: NonNullable<Awaited<ReturnType<typeof getPersonById>>>,
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
  recordingId: string,
) {
  const recording = await getSoloRecording(recordingId);
  if (!recording) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  if (
    !canAccessSoloRecording({
      person,
      session,
      recordingTeamId: recording.team_id,
    })
  ) {
    return {
      error: NextResponse.json(
        { error: "You can only comment on reviews for your own team." },
        { status: 403 },
      ),
    };
  }
  return { recording };
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const recordingId = url.searchParams.get("recordingId");
  if (!recordingId) {
    return NextResponse.json({ error: "recordingId required" }, { status: 400 });
  }
  const access = await assertRecordingAccess(person, session, recordingId);
  if ("error" in access && access.error) return access.error;
  const comments = await listReviewComments(recordingId);
  return NextResponse.json({ comments });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    recordingId?: string;
    body?: string;
    atMs?: number;
  };
  if (!body.recordingId || !body.body?.trim()) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const access = await assertRecordingAccess(person, session, body.recordingId);
  if ("error" in access && access.error) return access.error;
  try {
    const comment = await addReviewComment({
      recordingId: body.recordingId,
      authorId: person.id,
      body: body.body,
      atMs: body.atMs ?? 0,
    });
    return NextResponse.json({ comment });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 },
    );
  }
}
