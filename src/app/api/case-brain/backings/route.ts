import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/case-brain/auth";
import { updateBacking } from "@/lib/case-brain/service";
import type { Backing } from "@/lib/case-brain/types";

export async function PATCH(req: Request) {
  const auth = await requireMemberSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const body = (await req.json()) as {
    backingId?: string;
    text?: string;
    kind?: Backing["kind"];
    reason?: string;
  };
  if (!body.backingId) {
    return NextResponse.json({ error: "backingId required." }, { status: 400 });
  }
  const result = await updateBacking({
    backingId: body.backingId,
    personId: auth.session.personId,
    teamId: auth.teamId,
    text: body.text,
    kind: body.kind,
    reason: body.reason ?? "",
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
