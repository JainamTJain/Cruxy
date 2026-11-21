import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/ops/cron-auth";
import { runWeeklyLogicalBackup } from "@/lib/ops/backup";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Weekly logical backup of key tables to Supabase Storage.
 * Auth: Bearer CRON_SECRET or Vercel cron user-agent.
 */
export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const result = await runWeeklyLogicalBackup();
  return NextResponse.json(result);
}
