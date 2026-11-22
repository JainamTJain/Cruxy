import { NextResponse } from "next/server";
import { approveForgotPasscode } from "@/lib/auth/forgot-passcode";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import { markNotificationRead } from "@/lib/db/supabase/auth-extra";

export const runtime = "nodejs";

/** One-tap approve from reminders (coach or tech admin). */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actor = await getPersonById(session.personId);
  if (
    !actor ||
    (actor.role !== "tech_admin" && actor.role !== "coach_admin")
  ) {
    return NextResponse.json({ error: "Coach or tech admin only" }, { status: 403 });
  }

  const body = (await req.json()) as {
    requestId?: string;
    notificationId?: string;
  };
  if (!body.requestId) {
    return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
  }

  const result = await approveForgotPasscode({
    requestId: body.requestId,
    actorId: session.personId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  if (body.notificationId) {
    await markNotificationRead(session.personId, body.notificationId);
  }

  return NextResponse.json({
    ok: true,
    message: "Approved. They can set a new passcode on sign in.",
  });
}
