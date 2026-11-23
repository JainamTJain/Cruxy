import { NextResponse } from "next/server";
import { requireSession, requireTechAdmin } from "@/lib/auth/require-session";
import { listCases } from "@/lib/db/repository";
import { findOpenReadingForCase } from "@/lib/reading/open-reading";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Tech admin: find open reading for one case now (new requests land in Book requests). */
export async function POST(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const denied = requireTechAdmin(auth.session);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { caseId?: string };
  if (!body.caseId) {
    const cases = (await listCases()).filter((c) => c.active);
    return NextResponse.json({ cases: cases.map((c) => ({ id: c.id, number: c.number, title: c.title })) });
  }
  const result = await findOpenReadingForCase({
    caseId: body.caseId,
    personId: auth.session.personId,
  });
  return NextResponse.json({ ok: true, ...result });
}
