import { NextResponse } from "next/server";
import { setPersonalPasscode } from "@/lib/auth/passcode-rules";
import { getSession, updateSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as { code?: string; confirm?: string };
  if (!body.code || !body.confirm) {
    return NextResponse.json({ error: "Missing code." }, { status: 400 });
  }
  const result = await setPersonalPasscode(
    session.personId,
    body.code,
    body.confirm,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  await updateSession({ mustChoosePasscode: false });
  return NextResponse.json({ ok: true });
}
