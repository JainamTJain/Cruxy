import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import type { SoloPartId } from "@/lib/team/solo-prep";
import {
  createSoloRecording,
  listSoloRecordings,
} from "@/lib/team/solo-prep-repository";

export const runtime = "nodejs";

const PARTS: SoloPartId[] = [
  "presentation",
  "commentary",
  "response",
  "judges",
];

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const teamId = person.team_id ?? session.teamId;
  if (!teamId) {
    return NextResponse.json({ error: "No team" }, { status: 400 });
  }
  const url = new URL(req.url);
  const caseId = url.searchParams.get("caseId") ?? undefined;
  const mine = url.searchParams.get("mine") === "1";
  const recordings = await listSoloRecordings({
    teamId,
    caseId,
    personId: mine ? person.id : undefined,
  });
  return NextResponse.json({ recordings, meId: person.id });
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
  const teamId = person.team_id ?? session.teamId;
  if (!teamId) {
    return NextResponse.json({ error: "No team" }, { status: 400 });
  }
  const body = (await req.json()) as {
    caseId?: string;
    part?: SoloPartId;
    title?: string;
    durationMs?: number | null;
  };
  if (!body.caseId || !body.part || !PARTS.includes(body.part)) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  try {
    const recording = await createSoloRecording({
      personId: person.id,
      teamId,
      caseId: body.caseId,
      part: body.part,
      title: body.title ?? "",
      durationMs: body.durationMs,
    });
    return NextResponse.json({ recording });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 },
    );
  }
}
