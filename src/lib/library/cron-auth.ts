import { NextResponse } from "next/server";

/**
 * Protect Vercel cron routes.
 * - If CRON_SECRET is set: require Authorization: Bearer <CRON_SECRET>
 *   (Vercel Cron Jobs Run button sends this).
 * - If unset on Vercel: refuse everything. A user-agent check can be spoofed,
 *   and a spoofed sync would spend AI credit. Vercel's scheduled runs and the
 *   Cron Jobs "Run" button both send the secret once CRON_SECRET is set.
 */
export function authorizeCron(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return null;
  }

  // Local/dev convenience when not on Vercel
  if (!process.env.VERCEL) {
    return null;
  }

  return NextResponse.json(
    {
      error:
        "Unauthorized. CRON_SECRET is not set on this deployment.",
    },
    { status: 401 },
  );
}
