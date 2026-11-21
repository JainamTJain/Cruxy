import { NextResponse } from "next/server";
import { getSession, updateSession } from "@/lib/auth/session";
import { getPersonById, savePerson, logActivity } from "@/lib/db/repository";
import { markDigestPrompted } from "@/lib/db/supabase/auth-extra";

export const runtime = "nodejs";

/** Dr. B's first admin sign-in weekly summary opt-in (F-070). */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person || person.role !== "coach_admin") {
    return NextResponse.json({ prompt: false });
  }
  const needs =
    session.adminView &&
    !person.digest_prompted_at &&
    !person.digest_opt_in;
  return NextResponse.json({
    prompt: needs,
    digestOptIn: person.digest_opt_in,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person || person.role !== "coach_admin") {
    return NextResponse.json({ error: "Coach admin only" }, { status: 403 });
  }
  const body = (await req.json()) as { digestOptIn?: boolean };
  person.digest_opt_in = Boolean(body.digestOptIn);
  await savePerson(person);
  await markDigestPrompted(person.id);
  await logActivity({
    person_id: person.id,
    action: "digest_opt_in",
    target: person.id,
    meta: { digest_opt_in: person.digest_opt_in },
  });
  await updateSession({});
  return NextResponse.json({ ok: true, digestOptIn: person.digest_opt_in });
}
