import { NextResponse } from "next/server";
import {
  notifyDec5Reminders,
  notifySessionsStartingSoon,
} from "@/lib/notify/reach-jobs";

export const runtime = "nodejs";

/** Session-soon (≈15 min) and Dec 5 reminder windows. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const sessions = await notifySessionsStartingSoon();
  const dec5 = await notifyDec5Reminders();
  return NextResponse.json({ sessions, dec5 });
}
