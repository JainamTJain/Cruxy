import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getDriveConfigStatus, DriveAccessError } from "@/lib/library/drive";
import { runDriveSync } from "@/lib/library/sync";
import { latestSyncRun } from "@/lib/db/library-repository";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const status = getDriveConfigStatus();
  const latest = await latestSyncRun();
  return NextResponse.json({
    drive: status,
    latest,
    canSync: auth.session.role === "tech_admin",
  });
}

/** Tech-admin Sync now — digests new/changed Drive files into Supabase. */
export async function POST() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  if (auth.session.role !== "tech_admin") {
    return NextResponse.json({ error: "Tech admin only" }, { status: 403 });
  }

  try {
    const result = await runDriveSync({
      mode: "manual",
      personId: auth.session.personId,
    });
    const failed =
      Boolean(result.run.notes) &&
      result.run.files_processed === 0 &&
      result.run.files_seen === 0 &&
      /not visible|missing|could not|not configured/i.test(
        result.run.notes ?? "",
      );
    return NextResponse.json(
      {
        ok: !failed,
        run: result.run,
        message: result.message,
        drive: getDriveConfigStatus(),
        newFileIds: result.newFileIds,
        newFilesArrived: result.newFileIds.length > 0,
      },
      { status: failed ? 502 : 200 },
    );
  } catch (err) {
    if (err instanceof DriveAccessError) {
      return NextResponse.json(
        {
          ok: false,
          error: err.message,
          code: err.code,
          drive: getDriveConfigStatus(),
        },
        { status: 502 },
      );
    }
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
