import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import { isAdminViewer } from "@/lib/ops/privacy-scope";
import { createAssignment, listAssignments } from "@/lib/team/repository";
import type { AssignmentTargetKind } from "@/lib/team/types";

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
  const requestedPerson = url.searchParams.get("personId");
  const requestedTeam = url.searchParams.get("teamId");
  const admin = isAdminViewer(person, session);

  // Personal assignments: self by default. Admins in admin view may list others.
  const personId = admin
    ? (requestedPerson ?? undefined)
    : session.personId;
  if (!admin && requestedPerson && requestedPerson !== session.personId) {
    return NextResponse.json(
      { error: "You can only list your own assignments." },
      { status: 403 },
    );
  }
  const teamId = admin
    ? (requestedTeam ?? undefined)
    : (person.team_id ?? session.teamId ?? undefined);
  if (
    !admin &&
    requestedTeam &&
    teamId &&
    requestedTeam !== teamId
  ) {
    return NextResponse.json(
      { error: "You can only list assignments for your own team." },
      { status: 403 },
    );
  }
  const assignments = await listAssignments({
    personId: personId ?? session.personId,
    teamId,
  });
  return NextResponse.json({ assignments });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    teamId?: string;
    caseId?: string | null;
    personIds?: string[];
    task?: string;
    targetKind?: AssignmentTargetKind;
    targetId?: string | null;
    due?: string | null;
  };
  if (
    !body.teamId ||
    !body.personIds?.length ||
    !body.task ||
    !body.targetKind
  ) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  const assignments = await createAssignment({
    teamId: body.teamId,
    caseId: body.caseId ?? null,
    personIds: body.personIds,
    task: body.task,
    targetKind: body.targetKind,
    targetId: body.targetId,
    due: body.due,
    assignedBy: session.personId,
  });
  return NextResponse.json({ assignments });
}
