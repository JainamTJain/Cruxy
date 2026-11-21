import { NextResponse } from "next/server";
import { canSetCaseRole } from "@/lib/auth/capabilities";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import { listCaseRoles, setCaseRole } from "@/lib/team/repository";
import type { CaseRoleSlot } from "@/lib/team/types";
import { CASE_ROLE_SLOTS } from "@/lib/team/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const teamId = new URL(req.url).searchParams.get("teamId") ?? undefined;
  const roles = await listCaseRoles(teamId ?? undefined);
  return NextResponse.json({ roles });
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
    teamId?: string;
    caseId?: string;
    role?: string;
    personId?: string;
  };
  if (!body.teamId || !body.caseId || !body.role || !body.personId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!CASE_ROLE_SLOTS.includes(body.role as CaseRoleSlot)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  if (!canSetCaseRole(person, session, body.teamId)) {
    return NextResponse.json({ error: "Not on this team" }, { status: 403 });
  }
  try {
    const result = await setCaseRole({
      teamId: body.teamId,
      caseId: body.caseId,
      role: body.role as CaseRoleSlot,
      personId: body.personId,
      actorId: session.personId,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 },
    );
  }
}
