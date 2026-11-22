import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import { isAdminViewer } from "@/lib/ops/privacy-scope";
import {
  createHandoff,
  listHandoffs,
} from "@/lib/team/solo-prep-repository";

export const runtime = "nodejs";

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
  const caseId = url.searchParams.get("caseId");
  if (!caseId) {
    return NextResponse.json({ error: "caseId required" }, { status: 400 });
  }
  const admin = isAdminViewer(person, session);
  const ownTeam = person.team_id ?? session.teamId;
  if (!admin && !ownTeam) {
    return NextResponse.json({ error: "No team" }, { status: 400 });
  }
  const all = await listHandoffs(caseId);
  const handoffs = admin
    ? all
    : all.filter((h) => h.team_id === ownTeam);
  return NextResponse.json({ handoffs });
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
  const body = (await req.json()) as { caseId?: string; body?: string };
  if (!body.caseId || !body.body?.trim()) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  try {
    const handoff = await createHandoff({
      personId: person.id,
      teamId,
      caseId: body.caseId,
      body: body.body,
    });
    return NextResponse.json({ handoff });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 },
    );
  }
}
