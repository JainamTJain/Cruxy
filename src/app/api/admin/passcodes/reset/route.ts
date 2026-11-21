import { NextResponse } from "next/server";
import { resetPersonPasscode } from "@/lib/auth/passcode-rules";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const actor = await getPersonById(session.personId);
  if (!actor || actor.role !== "tech_admin") {
    return NextResponse.json({ error: "Tech admin only" }, { status: 403 });
  }
  const body = (await req.json()) as { personId?: string };
  if (!body.personId) {
    return NextResponse.json({ error: "Missing personId" }, { status: 400 });
  }
  if (body.personId === actor.id) {
    return NextResponse.json(
      { error: "Cannot reset your own listed passcode this way." },
      { status: 400 },
    );
  }
  const { oneTimeCode } = await resetPersonPasscode(actor.id, body.personId);
  return NextResponse.json({ ok: true, oneTimeCode });
}
