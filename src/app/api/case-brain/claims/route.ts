import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/case-brain/auth";
import { updateClaim } from "@/lib/case-brain/service";

export async function PATCH(req: Request) {
  const auth = await requireMemberSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json()) as {
    claimId?: string;
    text?: string;
    logic_line?: string | null;
    reason?: string;
  };
  if (!body.claimId) {
    return NextResponse.json({ error: "claimId required." }, { status: 400 });
  }
  const result = await updateClaim({
    claimId: body.claimId,
    personId: auth.session.personId,
    teamId: auth.teamId,
    text: body.text,
    logic_line: body.logic_line,
    reason: body.reason ?? "",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
