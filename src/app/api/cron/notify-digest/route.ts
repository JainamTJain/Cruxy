import { NextResponse } from "next/server";
import { sendDailyNotificationDigests } from "@/lib/notify/digest";

export const runtime = "nodejs";

/** Daily digest email for queued notification items. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const result = await sendDailyNotificationDigests();
  return NextResponse.json(result);
}
