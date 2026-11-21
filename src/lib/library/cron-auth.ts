import { NextResponse } from "next/server";

/**
 * Protect Vercel cron routes.
 * - If CRON_SECRET is set: require Authorization: Bearer <CRON_SECRET>
 *   (Vercel Cron Jobs Run button sends this).
 * - If unset: accept only requests that look like Vercel cron
 *   (user-agent contains "vercel-cron"), so the Hobby Run button still works
 *   without a secret while random callers are blocked.
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

  const ua = (req.headers.get("user-agent") ?? "").toLowerCase();
  if (ua.includes("vercel-cron")) {
    return null;
  }

  // Local/dev convenience when not on Vercel
  if (!process.env.VERCEL) {
    return null;
  }

  return NextResponse.json(
    {
      error:
        "Unauthorized. Set CRON_SECRET, or trigger from Vercel Cron Jobs (user-agent vercel-cron).",
    },
    { status: 401 },
  );
}
