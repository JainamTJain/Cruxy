import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/ops/cron-auth";
import { runAudioBackstopCleanup } from "@/lib/ops/audio-cleanup";
import { checkAndSendSpendAlert } from "@/lib/ops/spend-alert";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily: audio older than 24h + 80% spend alert check.
 * Auth: Bearer CRON_SECRET or Vercel cron user-agent.
 */
export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const audio = await runAudioBackstopCleanup();
  const spend = await checkAndSendSpendAlert();

  return NextResponse.json({ ok: true, audio, spend });
}
