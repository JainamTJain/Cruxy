import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/ops/cron-auth";
import { runSupabaseKeepalive } from "@/lib/ops/keepalive";

export const runtime = "nodejs";

/**
 * Daily ping so the free Supabase project never pauses.
 * Auth: Bearer CRON_SECRET or Vercel cron user-agent.
 */
export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const result = await runSupabaseKeepalive();
  return NextResponse.json(result);
}
