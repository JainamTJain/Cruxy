import { NextResponse } from "next/server";
import {
  requireSession,
  requireTechAdmin,
} from "@/lib/auth/require-session";
import { DriveAccessError } from "@/lib/library/drive";
import {
  driveWriteEnabled,
  driveWriteStatusMessage,
  uploadToCruxUploads,
} from "@/lib/library/drive-write";
import { runDriveSync, SyncBusyError } from "@/lib/library/sync";
import { getPersonById, logActivity } from "@/lib/db/repository";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * F-081: tech admin uploads a file into Drive "Crux uploads", then digests it.
 * No Google sign-in: uses the service account (needs Editor share + DRIVE_WRITE_ENABLED=1).
 */
export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const person = await getPersonById(auth.session.personId);
  const canUpload =
    person?.role === "tech_admin" && Boolean(auth.session.adminView);
  return NextResponse.json({
    writeEnabled: driveWriteEnabled(),
    message: driveWriteStatusMessage(),
    canUpload,
  });
}

export async function POST(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const denied = requireTechAdmin(auth.session);
  if (denied) return denied;
  const person = await getPersonById(auth.session.personId);
  if (!person || person.role !== "tech_admin") {
    return NextResponse.json({ error: "Tech admin only" }, { status: 403 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length === 0) {
      return NextResponse.json({ error: "empty file" }, { status: 400 });
    }
    if (buf.length > 12 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large (12 MB max for this upload)." },
        { status: 400 },
      );
    }

    const uploaded = await uploadToCruxUploads({
      name: file.name || "crux-upload.bin",
      mimeType: file.type || "application/octet-stream",
      bytes: buf,
    });

    await logActivity({
      person_id: auth.session.personId,
      action: "drive_crux_upload",
      target: uploaded.driveId,
      meta: { name: file.name, folderId: uploaded.folderId },
    });

    // Digest so Home / Reading room counts move without a separate Sync click.
    const sync = await runDriveSync({
      mode: "manual",
      personId: auth.session.personId,
      budgetMs: 90_000,
    });

    return NextResponse.json({
      ok: true,
      driveId: uploaded.driveId,
      folderId: uploaded.folderId,
      message: `Uploaded to Crux uploads. ${sync.message}`,
      sync: sync.run,
    });
  } catch (err) {
    if (err instanceof SyncBusyError) {
      return NextResponse.json(
        { ok: false, error: err.message, code: "sync_busy" },
        { status: 409 },
      );
    }
    if (err instanceof DriveAccessError) {
      return NextResponse.json(
        {
          ok: false,
          error: err.message,
          code: err.code,
          hint: driveWriteStatusMessage(),
        },
        { status: 502 },
      );
    }
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
