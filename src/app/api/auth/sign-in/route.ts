import { NextResponse } from "next/server";
import { attemptSignIn } from "@/lib/auth/passcode-rules";
import { setSessionCookie } from "@/lib/auth/session";
import { hashIp } from "@/lib/crypto/passcodes";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as { personId?: string; code?: string };
  if (!body.personId || !body.code) {
    return NextResponse.json({ error: "Missing person or code." }, { status: 400 });
  }
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip");
  const result = await attemptSignIn(body.personId, body.code, hashIp(ip));
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, lockedUntil: result.lockedUntil },
      { status: 401 },
    );
  }
  await setSessionCookie(result.session);
  return NextResponse.json({
    ok: true,
    mustConsent: result.session.mustConsent,
    mustChoosePasscode: result.session.mustChoosePasscode,
    name: result.person.name,
    role: result.person.role,
  });
}
