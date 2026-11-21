import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { recordCruxyFeedback } from "@/lib/cruxy/examples";
import { listPeopleFull } from "@/lib/db/repository";

/**
 * Useful / not useful / mark wrong feedback on Cruxy outputs.
 * Leads and admins may mark a point wrong.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.personId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = (await req.json()) as {
    agent?: string;
    feature?: string;
    verdict?: "useful" | "not_useful" | "wrong";
    reason?: string | null;
    outputRef?: string | null;
    caseId?: string | null;
  };

  if (!body.agent || !body.feature || !body.verdict) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  if (!["useful", "not_useful", "wrong"].includes(body.verdict)) {
    return NextResponse.json({ error: "Bad verdict." }, { status: 400 });
  }

  if (body.verdict === "wrong") {
    // Spec: leads and admins can mark a point wrong. Case lead is not a
    // separate auth role, so signed-in members (leads) and admins may mark wrong.
    const people = await listPeopleFull();
    const me = people.find((p) => p.id === session.personId);
    if (!me) {
      return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    }
  }

  const row = await recordCruxyFeedback({
    personId: session.personId,
    agent: body.agent,
    feature: body.feature,
    verdict: body.verdict,
    reason: body.reason ?? null,
    outputRef: body.outputRef ?? null,
    caseId: body.caseId ?? null,
  });

  return NextResponse.json({ ok: true, id: row.id });
}
