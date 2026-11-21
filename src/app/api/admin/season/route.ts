import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canWrite } from "@/lib/admin/permissions";
import { archiveSeasonStub, getPersonById } from "@/lib/db/repository";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canWrite(person.role, "season_rollover")) {
    return NextResponse.json(
      { error: "Season rollover is technical admin only." },
      { status: 403 },
    );
  }
  const result = await archiveSeasonStub(person.id);
  return NextResponse.json(result);
}
