import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById, logActivity, savePerson } from "@/lib/db/repository";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as { key?: string; done?: boolean };
  if (!body.key) {
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  person.first_run_checklist = {
    ...person.first_run_checklist,
    [body.key]: body.done !== false,
  };
  await savePerson(person);
  await logActivity({
    person_id: person.id,
    action: "checklist_update",
    target: body.key,
  });
  return NextResponse.json({ ok: true, checklist: person.first_run_checklist });
}
