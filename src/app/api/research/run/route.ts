import { NextResponse } from "next/server";
import { requireSession, requireAdmin } from "@/lib/auth/require-session";
import { runNightlyResearch } from "@/lib/library/researcher";
import { listResearchRuns } from "@/lib/db/library-repository";

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const denied = requireAdmin(auth.session);
  if (denied) return denied;

  const runs = await listResearchRuns(30);
  return NextResponse.json({ runs });
}

export async function POST(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const denied = requireAdmin(auth.session);
  if (denied) return denied;

  let caseNumbers: number[] | undefined;
  try {
    const body = (await req.json()) as { caseNumbers?: number[] };
    caseNumbers = body.caseNumbers;
  } catch {
    caseNumbers = undefined;
  }

  const result = await runNightlyResearch({
    personId: auth.session.personId,
    caseNumbers,
  });

  return NextResponse.json({ ok: true, ...result });
}
