import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createAssignment, listAssignments } from "@/lib/team/repository";
import type { AssignmentTargetKind } from "@/lib/team/types";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const personId = url.searchParams.get("personId") ?? undefined;
  const teamId = url.searchParams.get("teamId") ?? undefined;
  const assignments = await listAssignments({ personId, teamId });
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
