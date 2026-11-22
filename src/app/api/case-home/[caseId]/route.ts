import { NextResponse } from "next/server";
import { requireMemberSession } from "@/lib/case-brain/auth";
import { getCaseHome } from "@/lib/case-home/service";
import { listCases } from "@/lib/db/repository";

type Params = { params: Promise<{ caseId: string }> };

export async function GET(req: Request, { params }: Params) {
  const auth = await requireMemberSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { caseId } = await params;
  const url = new URL(req.url);
  const teamId = url.searchParams.get("teamId") ?? auth.teamId;

  const cases = await listCases();
  const caseRow = cases.find((c) => c.id === caseId);
  if (!caseRow) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  const home = await getCaseHome({
    caseId,
    teamId,
    caseRow,
  });

  return NextResponse.json(home, {
    headers: {
      "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
    },
  });
}
