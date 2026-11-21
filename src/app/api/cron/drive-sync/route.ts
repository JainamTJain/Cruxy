import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/library/cron-auth";
import { DriveAccessError } from "@/lib/library/drive";
import { runDriveSync } from "@/lib/library/sync";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Vercel cron: hourly Drive sync (Pro plan). Unchanged files are skipped, so most runs are quick.
 * Protect with CRON_SECRET Bearer, or Vercel cron user-agent when unset.
 * Trigger from Vercel → Cron Jobs → Run.
 */
export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  try {
    const result = await runDriveSync({ mode: "cron", personId: null });
    const failed = Boolean(result.run.notes && result.run.files_seen === 0 && result.run.files_processed === 0 && /not visible|missing|could not/i.test(result.run.notes));
    return NextResponse.json({
      ok: !failed,
      run: result.run,
      message: result.message,
      newFileIds: result.newFileIds,
    }, { status: failed ? 502 : 200 });
  } catch (err) {
    if (err instanceof DriveAccessError) {
      return NextResponse.json(
        { ok: false, error: err.message, code: err.code },
        { status: 502 },
      );
    }
    const message = err instanceof Error ? err.message : "Drive sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
