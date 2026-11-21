import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById, dumpStoreForAdmin } from "@/lib/db/repository";

export const runtime = "nodejs";

/** ai_calls are admin-only (members get 403). */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (
    !person ||
    !session.adminView ||
    (person.role !== "tech_admin" && person.role !== "coach_admin")
  ) {
    return NextResponse.json(
      { error: "Members cannot read ai_calls." },
      { status: 403 },
    );
  }
  const store = await dumpStoreForAdmin();
  return NextResponse.json({ ai_calls: store.ai_calls });
}
