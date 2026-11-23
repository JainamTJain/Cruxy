import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/ops/cron-auth";
import { listCases } from "@/lib/db/repository";
import { findOpenReadingForCase, listOpenReadings } from "@/lib/reading/open-reading";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Daily: refresh open reading for the three active cases with the thinnest
 * lists, so every case gets a deeper reading list and requests for material
 * that is not free.
 */
export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;
  const cases = (await listCases()).filter((c) => c.active);
  const counts = await Promise.all(
    cases.map(async (c) => ({ c, n: (await listOpenReadings(c.id).catch(() => [])).length })),
  );
  const pick = counts.sort((a, b) => a.n - b.n).slice(0, 3);
  const results = [];
  for (const { c } of pick) {
    const r = await findOpenReadingForCase({ caseId: c.id, personId: null }).catch((e) => ({
      added: 0,
      requested: 0,
      note: e instanceof Error ? e.message : "failed",
    }));
    results.push({ case: c.number, ...r });
  }
  return NextResponse.json({ ok: true, results });
}
