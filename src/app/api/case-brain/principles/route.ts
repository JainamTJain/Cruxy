import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/case-brain/auth";
import { upsertPrinciple } from "@/lib/case-brain/service";

export async function POST(req: Request) {
  const auth = await requireMemberSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json()) as {
    caseId?: string;
    principle?: string;
    claimId?: string | null;
  };
  if (!body.caseId || !body.principle?.trim()) {
    return NextResponse.json(
      { error: "caseId and principle required." },
      { status: 400 },
    );
  }
  const principle = await upsertPrinciple({
    teamId: auth.teamId,
    caseId: body.caseId,
    principle: body.principle,
    claimId: body.claimId,
    personId: auth.session.personId,
  });
  return NextResponse.json({ principle });
}
