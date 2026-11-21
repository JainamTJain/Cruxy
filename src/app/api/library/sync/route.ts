import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import { getDriveConfigStatus } from "@/lib/library/drive";
import { runDriveSync } from "@/lib/library/sync";
import { latestSyncRun } from "@/lib/db/library-repository";

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const status = getDriveConfigStatus();
  const latest = await latestSyncRun();
  return NextResponse.json({ drive: status, latest });
}

export async function POST() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const result = await runDriveSync({
    mode: "manual",
    personId: auth.session.personId,
  });

  return NextResponse.json({
    ok: true,
    run: result.run,
    message: result.message,
    drive: getDriveConfigStatus(),
  });
}
