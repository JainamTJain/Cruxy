import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/ops/cron-auth";
import { runNightlyCritique } from "@/lib/critique/run";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Vercel cron: nightly critique of every active case × team. */
export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const result = await runNightlyCritique({ personId: null });
  return NextResponse.json({ ok: true, ...result });
}
