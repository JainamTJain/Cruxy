import { NextResponse } from "next/server";
import { runDriveSync } from "@/lib/library/sync";

/**
 * Vercel cron: nightly Drive sync.
 * Protect with CRON_SECRET when set; otherwise allow in sample/dev.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await runDriveSync({ mode: "cron", personId: null });
  return NextResponse.json({
    ok: true,
    run: result.run,
    message: result.message,
  });
}
