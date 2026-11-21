import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getGlossary } from "@/lib/db/practice-repository";
import { refreshCaseGlossary } from "@/lib/practice/glossary-extra";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const caseId = new URL(req.url).searchParams.get("caseId");
  const terms = await getGlossary(caseId);
  return NextResponse.json({ terms });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { caseId?: string };
  if (!body.caseId) {
    return NextResponse.json({ error: "caseId required" }, { status: 400 });
  }
  const terms = await refreshCaseGlossary({
    caseId: body.caseId,
    personId: session.personId,
  });
  return NextResponse.json({ ok: true, terms });
}
