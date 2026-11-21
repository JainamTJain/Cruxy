import { NextResponse } from "next/server";
import { getSession, updateSession } from "@/lib/auth/session";
import { getPersonById, logActivity } from "@/lib/db/repository";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person || (person.role !== "tech_admin" && person.role !== "coach_admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json()) as { adminView?: boolean };
  const adminView = Boolean(body.adminView);
  await updateSession({ adminView });
  await logActivity({
    person_id: person.id,
    action: adminView ? "admin_view_on" : "admin_view_off",
    target: person.id,
  });
  return NextResponse.json({ ok: true, adminView });
}
