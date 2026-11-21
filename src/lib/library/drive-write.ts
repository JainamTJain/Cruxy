import "server-only";
import { google } from "googleapis";
import {
  DRIVE_READER_EMAIL,
  DriveAccessError,
  getDriveConfigStatus,
} from "@/lib/library/drive";

const CRUX_UPLOADS_FOLDER = "Crux uploads";

/**
 * F-081: write files added in Crux back to a "Crux uploads" folder.
 * Needs the service account shared as Editor on the root folder and
 * DRIVE_WRITE_ENABLED=1 (scopes beyond drive.readonly).
 * There is no Google sign-in step for members.
 */

export function driveWriteEnabled(): boolean {
  return process.env.DRIVE_WRITE_ENABLED?.trim() === "1";
}

function parseServiceAccount(): { client_email: string; private_key: string } {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    throw new DriveAccessError(
      "not_configured",
      `GOOGLE_SERVICE_ACCOUNT_JSON is missing for ${DRIVE_READER_EMAIL}.`,
    );
  }
  try {
    let json = raw;
    // Vercel sometimes stores JSON with literal \n in private_key.
    if (!raw.includes("\n") && raw.includes("\\n")) {
      json = raw.replace(/\\n/g, "\n");
    }
    const parsed = JSON.parse(json) as {
      client_email?: string;
      private_key?: string;
    };
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("missing fields");
    }
    let key = parsed.private_key;
    if (key.includes("\\n")) key = key.replace(/\\n/g, "\n");
    return { client_email: parsed.client_email, private_key: key };
  } catch {
    throw new DriveAccessError(
      "auth",
      "GOOGLE_SERVICE_ACCOUNT_JSON could not be parsed. Paste the full service account JSON.",
    );
  }
}

function writeClient() {
  if (!driveWriteEnabled()) {
    throw new DriveAccessError(
      "not_configured",
      "Drive writeback is off. Set DRIVE_WRITE_ENABLED=1 in Vercel and share the Ethics Bowl folder with the service account as Editor (not only Viewer).",
    );
  }
  const sa = parseServiceAccount();
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

async function ensureCruxUploadsFolder(rootFolderId: string): Promise<string> {
  const drive = writeClient();
  const found = await drive.files.list({
    q: `'${rootFolderId}' in parents and name = '${CRUX_UPLOADS_FOLDER}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id,name)",
    pageSize: 5,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const existing = found.data.files?.[0]?.id;
  if (existing) return existing;

  try {
    const created = await drive.files.create({
      requestBody: {
        name: CRUX_UPLOADS_FOLDER,
        mimeType: "application/vnd.google-apps.folder",
        parents: [rootFolderId],
      },
      fields: "id",
      supportsAllDrives: true,
    });
    if (!created.data.id) {
      throw new Error("no folder id");
    }
    return created.data.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/insufficient|permission|403|404/i.test(msg)) {
      throw new DriveAccessError(
        "not_shared",
        `Cannot create "${CRUX_UPLOADS_FOLDER}". Share folder ${rootFolderId} with ${DRIVE_READER_EMAIL} as Editor, then Sync now.`,
      );
    }
    throw err;
  }
}

/** Upload bytes into Drive "Crux uploads". Returns the new Drive file id. */
export async function uploadToCruxUploads(input: {
  name: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<{ driveId: string; folderId: string }> {
  const status = getDriveConfigStatus();
  if (!status.configured) {
    throw new DriveAccessError(
      "not_configured",
      status.stubReason ?? "Drive is not configured.",
    );
  }
  const root = process.env.DRIVE_ROOT_FOLDER_ID!.trim();
  const folderId = await ensureCruxUploadsFolder(root);
  const drive = writeClient();

  const { Readable } = await import("stream");
  const stream = Readable.from(input.bytes);

  try {
    const res = await drive.files.create({
      requestBody: {
        name: input.name,
        parents: [folderId],
      },
      media: {
        mimeType: input.mimeType,
        body: stream,
      },
      fields: "id",
      supportsAllDrives: true,
    });
    if (!res.data.id) throw new Error("upload returned no id");
    return { driveId: res.data.id, folderId };
  } catch (err) {
    if (err instanceof DriveAccessError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (/insufficient|permission|403/i.test(msg)) {
      throw new DriveAccessError(
        "not_shared",
        `Upload refused. Share the Ethics Bowl folder with ${DRIVE_READER_EMAIL} as Editor and set DRIVE_WRITE_ENABLED=1.`,
      );
    }
    throw new DriveAccessError("api", msg);
  }
}

export function driveWriteStatusMessage(): string {
  if (!driveWriteEnabled()) {
    return `Writeback off. To turn on Crux uploads: in Google Drive, share the Ethics Bowl folder with ${DRIVE_READER_EMAIL} as Editor, then set DRIVE_WRITE_ENABLED=1 in Vercel. No Google sign-in is required.`;
  }
  return `Writeback on. New Crux uploads go to the "${CRUX_UPLOADS_FOLDER}" folder under the Ethics Bowl Drive.`;
}
