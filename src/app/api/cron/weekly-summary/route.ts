import { NextResponse } from "next/server";
import { sendWeeklySummaryEmail } from "@/lib/email/weekly-summary";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vercel cron: Sunday 18:00 America/Los_Angeles.
 * Protect with CRON_SECRET when set.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await sendWeeklySummaryEmail();
  return NextResponse.json(result);
}
