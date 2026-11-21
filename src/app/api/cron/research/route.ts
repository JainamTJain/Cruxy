import { NextResponse } from "next/server";
import { runNightlyResearch } from "@/lib/library/researcher";

/** Vercel cron: nightly Researcher loop. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await runNightlyResearch({ personId: null });
  return NextResponse.json({ ok: true, ...result });
}
