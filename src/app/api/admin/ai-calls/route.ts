import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canRead } from "@/lib/admin/permissions";
import { getPersonById, listAiCalls } from "@/lib/db/repository";

export const runtime = "nodejs";

/** ai_calls are tech-admin only (spend). Coach/members get 403. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !session.adminView || !canRead(person.role, "spend")) {
    return NextResponse.json(
      { error: "Members and coach admin cannot read ai_calls." },
      { status: 403 },
    );
  }
  const ai_calls = await listAiCalls();
  return NextResponse.json({ ai_calls });
}
