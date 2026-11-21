import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById, logActivity, savePerson } from "@/lib/db/repository";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    email?: string;
    emailRemindersOptIn?: boolean;
    digestOptIn?: boolean;
  };
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  person.email = body.email?.trim() || null;
  person.email_reminders_opt_in = Boolean(body.emailRemindersOptIn);
  if (
    typeof body.digestOptIn === "boolean" &&
    (person.role === "tech_admin" || person.role === "coach_admin")
  ) {
    person.digest_opt_in = body.digestOptIn;
  }
  await savePerson(person);
  await logActivity({
    person_id: person.id,
    action: "reminders_updated",
    target: person.id,
    meta: {
      opt_in: person.email_reminders_opt_in,
      digest_opt_in: person.digest_opt_in,
    },
  });
  return NextResponse.json({ ok: true });
}
