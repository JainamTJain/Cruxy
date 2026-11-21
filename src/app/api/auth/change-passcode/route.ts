import { NextResponse } from "next/server";
import { changePersonalPasscode } from "@/lib/auth/passcode-rules";
import {
  getSession,
  setSessionCookie,
} from "@/lib/auth/session";
import { getPersonSessionVersion } from "@/lib/db/supabase/auth-extra";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    current?: string;
    next?: string;
    confirm?: string;
  };
  if (!body.current || !body.next || !body.confirm) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }
  const result = await changePersonalPasscode(
    session.personId,
    body.current,
    body.next,
    body.confirm,
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  // Keep this browser signed in with the new session version.
  const sessionVersion = await getPersonSessionVersion(session.personId);
  await setSessionCookie({ ...session, sessionVersion });
  return NextResponse.json({ ok: true });
}
