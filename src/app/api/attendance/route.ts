import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import {
  canTakeAttendance,
} from "@/lib/auth/capabilities";
import {
  confirmAttendanceSuggestions,
  listAttendanceDetailed,
  logSoloAttendance,
  markAttendanceAdmin,
  markSelfHere,
  prefillFromJoins,
  prefillFromVoiceMatches,
  sessionHasTextOnlyMembers,
} from "@/lib/attendance";
import type { AttendanceStatus } from "@/lib/practice/types";

export const runtime = "nodejs";

/** Server helpers for D's Session screen (F-071 to F-073, F-068 banner). */
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
    action?:
      | "mark_admin"
      | "im_here"
      | "prefill_joins"
      | "prefill_voice"
      | "confirm"
      | "solo";
    sessionId?: string;
    personId?: string;
    status?: AttendanceStatus;
    joinedPersonIds?: string[];
    matchedPersonIds?: string[];
  };

  if (!body.sessionId || !body.action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  switch (body.action) {
    case "mark_admin": {
      if (!canTakeAttendance(person, session)) {
        return NextResponse.json({ error: "Admin only" }, { status: 403 });
      }
      if (!body.personId || !body.status) {
        return NextResponse.json({ error: "Missing fields" }, { status: 400 });
      }
      const row = await markAttendanceAdmin({
        actorId: session.personId,
        sessionId: body.sessionId,
        personId: body.personId,
        status: body.status,
      });
      return NextResponse.json({ attendance: row });
    }
    case "im_here": {
      const row = await markSelfHere({
        personId: session.personId,
        sessionId: body.sessionId,
      });
      return NextResponse.json({ attendance: row });
    }
    case "prefill_joins": {
      if (!canTakeAttendance(person, session)) {
        return NextResponse.json({ error: "Admin only" }, { status: 403 });
      }
      const rows = await prefillFromJoins(
        body.sessionId,
        body.joinedPersonIds ?? [],
      );
      return NextResponse.json({ attendance: rows });
    }
    case "prefill_voice": {
      if (!canTakeAttendance(person, session)) {
        return NextResponse.json({ error: "Admin only" }, { status: 403 });
      }
      const rows = await prefillFromVoiceMatches(
        body.sessionId,
        body.matchedPersonIds ?? [],
      );
      return NextResponse.json({ attendance: rows });
    }
    case "confirm": {
      if (!canTakeAttendance(person, session)) {
        return NextResponse.json({ error: "Admin only" }, { status: 403 });
      }
      const count = await confirmAttendanceSuggestions({
        actorId: session.personId,
        sessionId: body.sessionId,
      });
      return NextResponse.json({ confirmed: count });
    }
    case "solo": {
      const row = await logSoloAttendance({
        personId: session.personId,
        sessionId: body.sessionId,
      });
      return NextResponse.json({ attendance: row });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
