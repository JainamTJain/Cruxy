import { NextResponse } from "next/server";
import { requireSession, requireTechAdmin } from "@/lib/auth/require-session";
import { listCases } from "@/lib/db/repository";
import { findOpenReadingForCase, listOpenReadings } from "@/lib/reading/open-reading";
import {
  listOpenReadingsNeedingText,
  prewarmOpenReadingTexts,
} from "@/lib/reading/reading-room";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Tech admin: find open reading for one case now (new requests land in Book
 * requests), or prepare text for every reading on that case still at
 * text_status none.
 */
export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const denied = requireTechAdmin(auth.session);
  if (denied) return denied;
  const cases = (await listCases()).filter((c) => c.active);
  const withCounts = await Promise.all(
    cases.map(async (c) => {
      const items = await listOpenReadings(c.id).catch(() => []);
      const needing = await listOpenReadingsNeedingText({ caseId: c.id, limit: 40 }).catch(() => []);
      return {
        id: c.id,
        number: c.number,
        title: c.title,
        readings: items.length,
        needingText: needing.length,
      };
    }),
  );
  return NextResponse.json({ cases: withCounts });
}

export async function POST(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const denied = requireTechAdmin(auth.session);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as {
    caseId?: string;
    action?: "find" | "prepare";
  };
  if (!body.caseId) {
    const cases = (await listCases()).filter((c) => c.active);
    return NextResponse.json({ cases: cases.map((c) => ({ id: c.id, number: c.number, title: c.title })) });
  }

  if (body.action === "prepare") {
    const prewarm = await prewarmOpenReadingTexts({
      caseId: body.caseId,
      personId: auth.session.personId,
      limit: 12,
      budgetMs: 240_000,
    });
    return NextResponse.json({ ok: true, action: "prepare", ...prewarm });
  }

  const result = await findOpenReadingForCase({
    caseId: body.caseId,
    personId: auth.session.personId,
  });
  return NextResponse.json({ ok: true, action: "find", ...result });
}
