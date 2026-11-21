import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  listAttendance,
  upsertAttendance,
} from "@/lib/db/practice-repository";
import type { AttendanceStatus } from "@/lib/practice/types";

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
  const rows = await listAttendance(sessionId);
  return NextResponse.json({ attendance: rows });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
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

  const admin =
    session.adminView &&
    (session.role === "tech_admin" || session.role === "coach_admin");

  const personId = body.personId ?? session.personId;
  if (!admin && personId !== session.personId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!admin && body.source === "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const row = await upsertAttendance({
    sessionId: body.sessionId,
    personId,
    status: body.status,
    source: body.source ?? (admin ? "admin" : "self"),
  });
  return NextResponse.json({ attendance: row });
}
