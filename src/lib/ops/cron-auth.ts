import "server-only";
import { NextResponse } from "next/server";

/**
 * Authorize a Vercel cron (or manual Bearer) request.
 * Accepts Authorization: Bearer $CRON_SECRET, or Vercel's cron user-agent
 * when CRON_SECRET is unset (local / early deploys).
 */
export function authorizeCron(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization");
  const ua = req.headers.get("user-agent") ?? "";

  if (secret) {
    if (auth === `Bearer ${secret}`) return null;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // No secret configured: allow Vercel Cron UA or local/dev callers.
  if (
    ua.includes("vercel-cron") ||
    process.env.NODE_ENV !== "production" ||
    process.env.VERCEL !== "1"
  ) {
    return null;
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
