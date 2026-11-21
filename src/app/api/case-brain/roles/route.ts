import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/case-brain/auth";
import { setCaseRole } from "@/lib/case-brain/service";
import type { CaseRoleKind } from "@/lib/case-brain/types";

const ROLES: CaseRoleKind[] = [
  "lead_1",
  "lead_2",
  "counter_arguer",
  "supporter",
];

export async function POST(req: Request) {
  const auth = await requireMemberSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json()) as {
    caseId?: string;
    personId?: string;
    role?: CaseRoleKind;
  };
  if (!body.caseId || !body.personId || !body.role || !ROLES.includes(body.role)) {
    return NextResponse.json({ error: "Invalid role payload." }, { status: 400 });
  }
  const role = await setCaseRole({
    teamId: auth.teamId,
    caseId: body.caseId,
    personId: body.personId,
    role: body.role,
    actorId: auth.session.personId,
  });
  return NextResponse.json({ role });
}
