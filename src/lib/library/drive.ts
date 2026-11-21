import "server-only";
import { google, type drive_v3 } from "googleapis";
import type { DriveListedFile } from "@/lib/library/types";
import { checksumOf } from "@/lib/library/embeddings";

export const DRIVE_READER_EMAIL =
  "crux-drive-reader@crux-ethics-bowl-jainam-jain.iam.gserviceaccount.com";

export type DriveConfigStatus = {
  configured: boolean;
  hasServiceAccount: boolean;
  hasFolderId: boolean;
  stubReason: string | null;
  serviceAccountEmail: string;
};

export class DriveAccessError extends Error {
  readonly code: "not_configured" | "not_shared" | "auth" | "api";
  constructor(code: DriveAccessError["code"], message: string) {
    super(message);
    this.name = "DriveAccessError";
    this.code = code;
  }
}

export function getDriveConfigStatus(): DriveConfigStatus {
  const hasServiceAccount = Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim(),
  );
  const hasFolderId = Boolean(process.env.DRIVE_ROOT_FOLDER_ID?.trim());
  if (!hasFolderId && !hasServiceAccount) {
    return {
      configured: false,
      hasServiceAccount,
      hasFolderId,
      stubReason:
        "DRIVE_ROOT_FOLDER_ID and GOOGLE_SERVICE_ACCOUNT_JSON are missing. Using sample Drive stubs locally.",
      serviceAccountEmail: DRIVE_READER_EMAIL,
    };
  }
  if (!hasFolderId) {
    return {
      configured: false,
      hasServiceAccount,
      hasFolderId,
      stubReason: `DRIVE_ROOT_FOLDER_ID is missing. Share the Ethics Bowl folder with ${DRIVE_READER_EMAIL} as Viewer, then set the folder id.`,
      serviceAccountEmail: DRIVE_READER_EMAIL,
    };
  }
  if (!hasServiceAccount) {
    return {
      configured: false,
      hasServiceAccount,
      hasFolderId,
      stubReason: `GOOGLE_SERVICE_ACCOUNT_JSON is missing. The key for ${DRIVE_READER_EMAIL} must be in Vercel env.`,
      serviceAccountEmail: DRIVE_READER_EMAIL,
    };
  }
  return {
    configured: true,
    hasServiceAccount,
    hasFolderId,
    stubReason: null,
    serviceAccountEmail: DRIVE_READER_EMAIL,
  };
}

/** Sample Ethics Bowl tree used when Drive is not configured (local only). */
export function listSampleDriveFiles(): DriveListedFile[] {
  const samples: Omit<DriveListedFile, "checksum">[] = [
    {
      drive_id: "sample-case-set-2026",
      name: "IEB Case Set 2026 (California).pdf",
      path: "/Case Sets/IEB Case Set 2026 (California).pdf",
      mime: "application/pdf",
      modified_at: "2026-10-01T12:00:00.000Z",
      text_content: [
        "CASE 9 — GEM in the Rough",
        "The Grand Egyptian Museum opened near the pyramids in November 2025, holding tens of thousands of objects from five millennia. Its opening renewed a familiar question about objects held abroad.",
        "The Rosetta Stone was found by French forces in the late 1790s and passed to Britain soon after, where it has been on display ever since. The British Museum says it has received no formal request from Egypt's government, and that a 1963 law strictly limits what it may give away.",
        "Supporters of return point to the circumstances of the taking and to Egypt's new capacity to care for the object. Defenders of the current arrangement point to global access, the cost of deaccessioning, and public trust.",
        "",
        "CASE 1 — CTRL-ALT-DEFENSE",
        "A university must decide whether to deploy an AI defense system that filters student speech online.",
        "Stakeholders include students, administrators, and outside speakers.",
        "",
        "CASE 12 — Medicine and Misinformation",
        "A clinician wonders whether correcting a patient's false medical beliefs online violates professional neutrality.",
      ].join("\n"),
    },
    {
      drive_id: "sample-1801-capitulation",
      name: "1801 Capitulation notes",
      path: "/Case 9/1801 Capitulation notes.gdoc",
      mime: "application/vnd.google-apps.document",
      modified_at: "2026-11-08T15:00:00.000Z",
      text_content: [
        "1801 Capitulation of Alexandria — notes for Case 9",
        "Article 16 is cited by the British Museum as the transfer instrument.",
        "An Ottoman admiral signed; whether that binds Egypt's claim is contested.",
        "Use only after verifying against a primary source.",
      ].join("\n"),
    },
    {
      drive_id: "sample-team3-practice-c9",
      name: "Team 3 practice, Nov 12",
      path: "/Practice/Team 3 practice Case 9 Nov 12.txt",
      mime: "text/plain",
      modified_at: "2026-11-12T21:00:00.000Z",
      text_content: [
        "[0:00] Katie: Our four-part test keeps us off the slippery slope.",
        "[1:20] Jainam: Waldron says the claim is superseded for land.",
        "[2:10] Nick: Idea — concede for land, distinguish objects, rebut with responsibility.",
        "[3:40] Daniel: Consistency with Case 12 least-restrictive tool?",
      ].join("\n"),
    },
    {
      drive_id: "sample-appe-scoring",
      name: "APPE IEB Fillable Scoring Sheet August 2020.pdf",
      path: "/Training Documents/APPE IEB Fillable Scoring Sheet August 2020.pdf",
      mime: "application/pdf",
      modified_at: "2020-08-15T12:00:00.000Z",
      text_content: [
        "APPE Intercollegiate Ethics Bowl Scoring Sheet",
        "Presentation A: Was the presentation clear and systematic?",
        "Presentation B: Did the presentation identify central moral dimensions?",
        "Presentation C: Awareness of different viewpoints?",
      ].join("\n"),
    },
    {
      drive_id: "sample-practice-transcript-c1",
      name: "Practice transcript Case 1 Nov 12.txt",
      path: "/Practice/Practice transcript Case 1 Nov 12.txt",
      mime: "text/plain",
      modified_at: "2026-11-12T21:00:00.000Z",
      text_content: [
        "[0:00] Ivan: Our claim is that automated filters should be a last resort.",
        "[0:45] Ashton: The other side will say platforms already moderate.",
        "[2:10] Serena: Idea — compare this to least restrictive means in Case 12.",
      ].join("\n"),
    },
    {
      drive_id: "sample-unsorted-scraps",
      name: "random dump untitled.gdoc",
      path: "/Inbox/random dump untitled.gdoc",
      mime: "application/vnd.google-apps.document",
      modified_at: "2026-11-18T09:00:00.000Z",
      text_content: [
        "Assorted links and fragments with no clear case label.",
        "Someone pasted this from a chat. Needs Jainam to sort.",
      ].join("\n"),
    },
  ];

  return samples.map((s) => ({
    ...s,
    checksum: checksumOf(
      `${s.drive_id}|${s.modified_at}|${s.text_content ?? s.name}`,
    ),
  }));
}

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

function parseServiceAccount(): ServiceAccount {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    throw new DriveAccessError(
      "not_configured",
      `GOOGLE_SERVICE_ACCOUNT_JSON is missing. Add the JSON key for ${DRIVE_READER_EMAIL} in Vercel.`,
    );
  }
  const parsed = tryParseServiceAccount(raw);
  if (!parsed) {
    throw new DriveAccessError(
      "auth",
      "GOOGLE_SERVICE_ACCOUNT_JSON could not be parsed. Paste the whole downloaded key file (from { to }) as the value.",
    );
  }
  return parsed;
}

/**
 * Accepts the key the ways it usually gets pasted into Vercel: the file as is
 * (one line or many), wrapped in quotes, base64, or with its \n escapes already
 * turned into real line breaks. Parse first, then fix private_key newlines.
 */
function tryParseServiceAccount(raw: string): ServiceAccount | null {
  const candidates: string[] = [raw];
  if (/^['"].*['"]$/s.test(raw)) candidates.push(raw.slice(1, -1));
  if (!raw.trimStart().startsWith("{")) {
    try {
      candidates.push(Buffer.from(raw, "base64").toString("utf8"));
    } catch {
      /* not base64 */
    }
  }
  // Real line breaks inside the private_key string make JSON invalid: escape them.
  for (const c of [...candidates]) {
    if (!c.includes("\n")) continue;
    candidates.push(c.replace(/\r?\n/g, "\\n"));
  }
  for (const text of candidates) {
    try {
      const parsed = JSON.parse(text) as ServiceAccount;
      if (!parsed?.client_email || !parsed?.private_key) continue;
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
      return parsed;
    } catch {
      /* try the next form */
    }
  }
  return null;
}

function getFolderId(): string {
  const id = process.env.DRIVE_ROOT_FOLDER_ID?.trim();
  if (!id) {
    throw new DriveAccessError(
      "not_configured",
      `DRIVE_ROOT_FOLDER_ID is missing. Share the Ethics Bowl folder with ${DRIVE_READER_EMAIL} as Viewer, then set the id.`,
    );
  }
  return id;
}

function driveClient() {
  const sa = parseServiceAccount();
  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  return google.drive({ version: "v3", auth });
}

function isNotSharedError(err: unknown): boolean {
  const status =
    (err as { code?: number; response?: { status?: number } })?.code ??
    (err as { response?: { status?: number } })?.response?.status;
  if (status === 404 || status === 403) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /File not found|notFound|insufficientPermissions|The user does not have sufficient permissions/i.test(
    msg,
  );
}

function notSharedMessage(folderId: string): string {
  return `Drive folder ${folderId} is not visible to ${DRIVE_READER_EMAIL}. Share that folder with the service account as Viewer (Editor is fine too), wait a minute, then Sync now again.`;
}

/**
 * List files under DRIVE_ROOT_FOLDER_ID (recursive).
 * Locally, falls back to sample stubs when not configured.
 * On Vercel / when configured, fails clearly if the folder is not shared.
 */
export async function listDriveFiles(): Promise<{
  files: DriveListedFile[];
  stub: boolean;
  notes: string | null;
}> {
  const status = getDriveConfigStatus();
  const onVercel = Boolean(process.env.VERCEL);

  if (!status.configured) {
    if (onVercel) {
      throw new DriveAccessError(
        "not_configured",
        status.stubReason ?? "Drive is not configured on Vercel.",
      );
    }
    return {
      files: listSampleDriveFiles(),
      stub: true,
      notes: status.stubReason,
    };
  }

  const folderId = getFolderId();
  const drive = driveClient();

  try {
    // Probe root access first so a missing share fails with a clear message.
    await drive.files.get({
      fileId: folderId,
      fields: "id,name,mimeType",
      supportsAllDrives: true,
    });
  } catch (err) {
    if (isNotSharedError(err)) {
      throw new DriveAccessError("not_shared", notSharedMessage(folderId));
    }
    const message = err instanceof Error ? err.message : "Drive auth failed";
    throw new DriveAccessError("auth", message);
  }

  const files: DriveListedFile[] = [];
  const queue: { id: string; path: string }[] = [{ id: folderId, path: "" }];

  try {
    while (queue.length) {
      const folder = queue.shift()!;
      let pageToken: string | undefined;
      do {
        const res = await drive.files.list({
          q: `'${folder.id}' in parents and trashed = false`,
          fields:
            "nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum,shortcutDetails)",
          pageSize: 100,
          pageToken,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });
        for (const f of res.data.files ?? []) {
          if (!f.id || !f.name || !f.mimeType) continue;
          // Skip audio / video (decision: none in the Drive)
          if (
            f.mimeType.startsWith("audio/") ||
            f.mimeType.startsWith("video/")
          ) {
            continue;
          }
          const path = `${folder.path}/${f.name}`;
          if (f.mimeType === "application/vnd.google-apps.folder") {
            queue.push({ id: f.id, path });
            continue;
          }
          const modified = f.modifiedTime ?? new Date().toISOString();
          files.push({
            drive_id: f.id,
            name: f.name,
            path,
            mime: f.mimeType,
            modified_at: modified,
            checksum:
              f.md5Checksum ?? checksumOf(`${f.id}|${modified}|${f.name}`),
          });
        }
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);
    }
  } catch (err) {
    if (isNotSharedError(err)) {
      throw new DriveAccessError("not_shared", notSharedMessage(folderId));
    }
    const message = err instanceof Error ? err.message : "Drive list failed";
    throw new DriveAccessError("api", message);
  }

  return { files, stub: false, notes: null };
}

function extractPrintableFromPdf(buf: Buffer): {
  text: string;
  scanned: boolean;
} {
  // Lightweight PDF text scrape without a native parser: pull printable
  // strings from stream content. Scanned PDFs yield almost nothing.
  const raw = buf.toString("latin1");
  const chunks: string[] = [];
  const re = /\((?:\\.|[^\\)]){2,}\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const inner = m[0]
      .slice(1, -1)
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\t/g, " ")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\");
    if (/[A-Za-z]{3,}/.test(inner)) chunks.push(inner);
  }
  const text = chunks.join(" ").replace(/\s+/g, " ").trim();
  if (text.length < 40) {
    return { text: "", scanned: true };
  }
  return { text, scanned: false };
}

/** Export / download text for a Drive file. Sample stubs already include text. */
export async function extractDriveText(
  listed: DriveListedFile,
): Promise<{ text: string; scannedPdf: boolean; stub: boolean }> {
  if (listed.text_content != null) {
    return { text: listed.text_content, scannedPdf: false, stub: true };
  }

  const status = getDriveConfigStatus();
  if (!status.configured) {
    return {
      text: `(No text available for ${listed.name} — Drive not configured.)`,
      scannedPdf: false,
      stub: true,
    };
  }

  const drive = driveClient();

  try {
    if (listed.mime.startsWith("application/vnd.google-apps.")) {
      const exportMime =
        listed.mime === "application/vnd.google-apps.spreadsheet"
          ? "text/csv"
          : listed.mime === "application/vnd.google-apps.presentation"
            ? "text/plain"
            : "text/plain";
      const res = await drive.files.export(
        { fileId: listed.drive_id, mimeType: exportMime },
        { responseType: "arraybuffer" },
      );
      const text = Buffer.from(res.data as ArrayBuffer).toString("utf8");
      return { text, scannedPdf: false, stub: false };
    }

    const res = await drive.files.get(
      { fileId: listed.drive_id, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" },
    );
    const buf = Buffer.from(res.data as ArrayBuffer);

    if (listed.mime === "application/pdf") {
      const extracted = extractPrintableFromPdf(buf);
      if (extracted.scanned) {
        return {
          text: `[Scanned PDF flagged for Jainam: ${listed.name}]`,
          scannedPdf: true,
          stub: false,
        };
      }
      return { text: extracted.text, scannedPdf: false, stub: false };
    }

    // Plain text / csv / markdown / docx-ish: prefer utf8 printable
    const text = buf.toString("utf8");
    const printable = text.replace(/[^\x20-\x7E\n\r\t]/g, "");
    return {
      text: printable.trim().length > 20 ? printable : text,
      scannedPdf: false,
      stub: false,
    };
  } catch (err) {
    if (isNotSharedError(err)) {
      throw new DriveAccessError(
        "not_shared",
        notSharedMessage(getFolderId()),
      );
    }
    const message = err instanceof Error ? err.message : "extract failed";
    return {
      text: `(Extract failed for ${listed.name}: ${message})`,
      scannedPdf: false,
      stub: true,
    };
  }
}

/** Unused import guard for types used only in JSDoc / future changes.list. */
export type DriveFileMeta = drive_v3.Schema$File;
