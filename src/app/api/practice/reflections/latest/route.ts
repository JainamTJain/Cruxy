import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getLatestReflectionForCase,
  listReflectionsForPerson,
} from "@/lib/learning/reflections";

export const runtime = "nodejs";

/**
 * Prior reflection for next practice.
 * With caseId: last reflection on that case.
 * Without: latest overall (session start focus).
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const caseId = new URL(req.url).searchParams.get("caseId");
  if (caseId) {
    const reflection = await getLatestReflectionForCase(
      session.personId,
      caseId,
    );
    return NextResponse.json({ reflection });
  }
  const rows = await listReflectionsForPerson(session.personId, 1);
  return NextResponse.json({ reflection: rows[0] ?? null });
}
