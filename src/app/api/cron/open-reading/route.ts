import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/ops/cron-auth";
import { listCases } from "@/lib/db/repository";
import { findOpenReadingForCase, listOpenReadings } from "@/lib/reading/open-reading";
import { prewarmOpenReadingTexts } from "@/lib/reading/reading-room";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Daily: refresh open reading for the three active cases with the thinnest
 * lists, so every case gets a deeper reading list and requests for material
 * that is not free. Then prewarm text for rows still at text_status none so
 * the first open in the reading room is fast.
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

  // Leave headroom under maxDuration=300s. Prefer the cases we just refreshed,
  // then any other pending rows.
  let remaining = 8;
  let budgetLeft = 200_000;
  const prewarm: { case: number | "other"; attempted: number; done: number; failed: number; skipped: number }[] = [];
  for (const { c } of pick) {
    if (remaining <= 0 || budgetLeft < 5_000) break;
    const t0 = Date.now();
    const p = await prewarmOpenReadingTexts({
      caseId: c.id,
      personId: null,
      limit: remaining,
      budgetMs: budgetLeft,
    }).catch(() => ({ attempted: 0, done: 0, failed: 0, skipped: 0 }));
    prewarm.push({ case: c.number, ...p });
    remaining -= p.attempted;
    budgetLeft -= Date.now() - t0;
  }
  if (remaining > 0 && budgetLeft >= 5_000) {
    const p = await prewarmOpenReadingTexts({
      personId: null,
      limit: remaining,
      budgetMs: budgetLeft,
    }).catch(() => ({ attempted: 0, done: 0, failed: 0, skipped: 0 }));
    if (p.attempted > 0 || p.skipped > 0) prewarm.push({ case: "other", ...p });
  }

  return NextResponse.json({ ok: true, results, prewarm });
}
