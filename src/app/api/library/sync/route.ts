import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/require-session";
import {
  DRIVE_READER_EMAIL,
  getDriveConfigStatus,
  DriveAccessError,
} from "@/lib/library/drive";
import {
  driveWriteEnabled,
  driveWriteStatusMessage,
} from "@/lib/library/drive-write";
import { runDriveSync } from "@/lib/library/sync";
import { latestSyncRun } from "@/lib/db/library-repository";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Exact clicks for Jainam: no Google sign-in; share once with the service account. */
const CONNECT_STEPS = [
  "Open Google Drive in the browser while signed in as an editor on the Ethics Bowl folder (Jainam or Dr. B).",
  "Open the folder \"Ethics Bowl 2026 CA Regional\" (id 107T2YG-6MWUhRzy_EM_k2t4x5eyJQh64).",
  "Click Share (person-plus icon).",
  `Paste ${DRIVE_READER_EMAIL} and set the role to Viewer (read sync) or Editor (also needed for Crux uploads writeback).`,
  "Uncheck \"Notify people\" if offered, then click Share or Send.",
  "In Vercel, confirm GOOGLE_SERVICE_ACCOUNT_JSON and DRIVE_ROOT_FOLDER_ID are set for Production.",
  "Sign in to Crux as tech admin, open Reading room (/library), click Sync now.",
  "For Crux uploads writeback only: set DRIVE_WRITE_ENABLED=1 in Vercel and share as Editor (still no Google sign-in).",
];

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const status = getDriveConfigStatus();
  const latest = await latestSyncRun();
  return NextResponse.json({
    drive: status,
    latest,
    canSync: auth.session.role === "tech_admin",
    writeEnabled: driveWriteEnabled(),
    writeMessage: driveWriteStatusMessage(),
    connectSteps: CONNECT_STEPS,
    serviceAccountEmail: DRIVE_READER_EMAIL,
    folderId: process.env.DRIVE_ROOT_FOLDER_ID?.trim() ?? null,
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
