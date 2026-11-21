import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import { canTakeAttendance } from "@/lib/auth/capabilities";
import {
  listAttendanceDetailed,
  markAttendanceAdmin,
  markSelfHere,
  sessionHasTextOnlyMembers,
} from "@/lib/attendance";
import type { AttendanceStatus } from "@/lib/practice/types";

export const runtime = "nodejs";

/** D's Session screen calls this; logic lives in Workstream J helpers. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }
  const [attendance, textOnly] = await Promise.all([
    listAttendanceDetailed(sessionId),
    sessionHasTextOnlyMembers(sessionId),
  ]);
  return NextResponse.json({ attendance, textOnlyBanner: textOnly });
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
    sessionId?: string;
    personId?: string;
    status?: AttendanceStatus;
    source?: "admin" | "self" | "voice" | "join";
  };
  if (!body.sessionId || !body.status) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const admin = canTakeAttendance(person, session);
  const personId = body.personId ?? session.personId;
  if (!admin && personId !== session.personId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!admin && body.source === "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (admin && (body.source === "admin" || !body.source)) {
    const row = await markAttendanceAdmin({
      actorId: session.personId,
      sessionId: body.sessionId,
      personId,
      status: body.status,
    });
    return NextResponse.json({ attendance: row });
  }

  const row = await markSelfHere({
    personId: session.personId,
    sessionId: body.sessionId,
  });
  return NextResponse.json({ attendance: row });
}
