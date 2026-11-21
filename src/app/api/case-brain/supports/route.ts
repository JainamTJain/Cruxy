import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/case-brain/auth";
import { updateSupport } from "@/lib/case-brain/service";

export async function PATCH(req: Request) {
  const auth = await requireMemberSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json()) as {
    supportId?: string;
    text?: string;
    reason?: string;
  };
  if (!body.supportId) {
    return NextResponse.json({ error: "supportId required." }, { status: 400 });
  }
  const result = await updateSupport({
    supportId: body.supportId,
    personId: auth.session.personId,
    teamId: auth.teamId,
    text: body.text,
    reason: body.reason ?? "",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
