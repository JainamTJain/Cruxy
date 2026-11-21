import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/case-brain/auth";
import { updateCounterclaim } from "@/lib/case-brain/service";

export async function PATCH(req: Request) {
  const auth = await requireMemberSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json()) as {
    counterclaimId?: string;
    text?: string;
    concede?: string | null;
    distinguish?: string | null;
    rebut?: string | null;
    reason?: string;
  };
  if (!body.counterclaimId) {
    return NextResponse.json(
      { error: "counterclaimId required." },
      { status: 400 },
    );
  }
  const result = await updateCounterclaim({
    counterclaimId: body.counterclaimId,
    personId: auth.session.personId,
    teamId: auth.teamId,
    text: body.text,
    concede: body.concede,
    distinguish: body.distinguish,
    rebut: body.rebut,
    reason: body.reason ?? "",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
