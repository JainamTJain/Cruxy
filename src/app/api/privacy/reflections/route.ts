import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { deleteReflectionsForPerson } from "@/lib/learning/reflections";

export const runtime = "nodejs";

/** Delete all of my round reflections. */
export async function DELETE() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const count = await deleteReflectionsForPerson(session.personId);
  return NextResponse.json({ ok: true, count });
}
