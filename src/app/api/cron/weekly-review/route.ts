import { NextResponse } from "next/server";
import { draftWeeklyReview } from "@/lib/cruxy/weekly-review";

/** Vercel cron: draft Cruxy's weekly review for the technical admin. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const draft = await draftWeeklyReview({ personId: null });
  return NextResponse.json({
    ok: true,
    id: draft.id,
    week_start: draft.week_start,
    status: draft.status,
  });
}
