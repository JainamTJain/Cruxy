import { NextResponse } from "next/server";
import { clearSessionCookie, getSession } from "@/lib/auth/session";
import { logActivity } from "@/lib/db/repository";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSession();
  if (session) {
    await logActivity({
      person_id: session.personId,
      action: "sign_out",
      target: session.personId,
    });
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
