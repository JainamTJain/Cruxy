import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/case-brain/auth";
import { listOpenReadings } from "@/lib/reading/open-reading";

export const runtime = "nodejs";

/** Open reading from the web for a case (public material, every team). */
export async function GET(req: Request) {
  const auth = await requireMemberSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const caseId = new URL(req.url).searchParams.get("caseId");
  if (!caseId) return NextResponse.json({ error: "caseId required" }, { status: 400 });
  // The coach does not see books the tech admin uploaded.
  const items = await listOpenReadings(caseId, { hideUploads: auth.person.role === "coach_admin" }).catch(() => []);
  return NextResponse.json({ items });
}
