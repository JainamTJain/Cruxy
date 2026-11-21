import { createSign } from "crypto";
import type { DriveListedFile } from "@/lib/library/types";
import { checksumOf } from "@/lib/library/embeddings";

export type DriveConfigStatus = {
  configured: boolean;
  hasServiceAccount: boolean;
  hasFolderId: boolean;
  stubReason: string | null;
};

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
        "DRIVE_ROOT_FOLDER_ID and GOOGLE_SERVICE_ACCOUNT_JSON are missing. Using sample Drive stubs.",
    };
  }
  if (!hasFolderId) {
    return {
      configured: false,
      hasServiceAccount,
      hasFolderId,
      stubReason:
        "DRIVE_ROOT_FOLDER_ID is missing. Share the Ethics Bowl folder with the service account, then set the folder id. Using sample Drive stubs.",
    };
  }
  if (!hasServiceAccount) {
    return {
      configured: false,
      hasServiceAccount,
      hasFolderId,
      stubReason:
        "GOOGLE_SERVICE_ACCOUNT_JSON is missing. Using sample Drive stubs.",
    };
  }
  return {
    configured: true,
    hasServiceAccount,
    hasFolderId,
    stubReason: null,
  };
}

/** Sample Ethics Bowl tree used when Drive is not configured. */
export function listSampleDriveFiles(): DriveListedFile[] {
  const samples: Omit<DriveListedFile, "checksum">[] = [
    {
      drive_id: "sample-case-set-2026",
      name: "IEB Case Set 2026 (California).pdf",
      path: "/Case Sets/IEB Case Set 2026 (California).pdf",
      mime: "application/pdf",
      modified_at: "2026-10-01T12:00:00.000Z",
      text_content: [
        "CASE 1 — CTRL-ALT-DEFENSE",
        "A university must decide whether to deploy an AI defense system that filters student speech online.",
        "Stakeholders include students, administrators, and outside speakers.",
        "The crux: does automated moderation respect autonomy while preventing harm?",
        "",
        "CASE 3 — Sister City No More",
        "A city council considers ending a sister-city relationship after human rights reports.",
        "Values in tension: solidarity, economic benefit, and moral consistency.",
        "",
        "CASE 12 — Medicine and Misinformation",
        "A clinician wonders whether correcting a patient's false medical beliefs online violates professional neutrality.",
        "Frameworks: Mill on harm, professional ethics codes, and public trust.",
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
        "Commentary, Response to commentary, Response to judges — each 1 to 10.",
      ].join("\n"),
    },
    {
      drive_id: "sample-team1-notes-c12",
      name: "Team 1 Case 12 notes.docx",
      path: "/Team 1/Case 12 notes.docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      modified_at: "2026-11-10T18:00:00.000Z",
      text_content: [
        "Case 12 — Medicine and Misinformation — Team 1 notes",
        "Claim 1: Clinicians have a duty to correct dangerous misinformation when they have special standing.",
        "Support: public trust in medicine depends on willingness to correct falsehoods.",
        "Counterclaim: correction can look like viewpoint discrimination; concede that tone matters.",
        "Idea raised by Serena: treat correction as a least-restrictive tool, not a speech ban.",
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
        "[3:00] Coach: Good. Name the stakeholder who cannot speak for themselves.",
      ].join("\n"),
    },
    {
      drive_id: "sample-rules",
      name: "IEB Regional Rules.pdf",
      path: "/Rules/IEB Regional Rules.pdf",
      mime: "application/pdf",
      modified_at: "2025-09-01T12:00:00.000Z",
      text_content: [
        "Presentation 7 to 12 minutes. Commentary 5 to 8. Judges Q&A 10 to 15.",
        "Teams may confer for 60 seconds with scratch paper only.",
        "Spirit points are scored separately.",
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
  token_uri?: string;
};

function parseServiceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch {
    return null;
  }
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const claim = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(sa.private_key, "base64url");
  const assertion = `${unsigned}.${signature}`;

  const res = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`Drive token exchange failed (${res.status})`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/**
 * List files under DRIVE_ROOT_FOLDER_ID (recursive).
 * Falls back to sample stubs when not configured or on API failure.
 */
export async function listDriveFiles(): Promise<{
  files: DriveListedFile[];
  stub: boolean;
  notes: string | null;
}> {
  const status = getDriveConfigStatus();
  if (!status.configured) {
    return {
      files: listSampleDriveFiles(),
      stub: true,
      notes: status.stubReason,
    };
  }

  const sa = parseServiceAccount();
  const folderId = process.env.DRIVE_ROOT_FOLDER_ID!.trim();
  if (!sa?.client_email || !sa.private_key) {
    return {
      files: listSampleDriveFiles(),
      stub: true,
      notes: "Service account JSON could not be parsed. Using sample Drive stubs.",
    };
  }

  try {
    const token = await getAccessToken(sa);
    const files: DriveListedFile[] = [];
    const queue: { id: string; path: string }[] = [
      { id: folderId, path: "" },
    ];

    while (queue.length) {
      const folder = queue.shift()!;
      let pageToken: string | undefined;
      do {
        const q = encodeURIComponent(
          `'${folder.id}' in parents and trashed = false`,
        );
        const fields = encodeURIComponent(
          "nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum,shortcutDetails)",
        );
        const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=100${
          pageToken ? `&pageToken=${pageToken}` : ""
        }`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Drive list failed (${res.status})`);
        }
        const data = (await res.json()) as {
          nextPageToken?: string;
          files?: {
            id: string;
            name: string;
            mimeType: string;
            modifiedTime?: string;
            md5Checksum?: string;
          }[];
        };
        for (const f of data.files ?? []) {
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
              f.md5Checksum ??
              checksumOf(`${f.id}|${modified}|${f.name}`),
          });
        }
        pageToken = data.nextPageToken;
      } while (pageToken);
    }

    return { files, stub: false, notes: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Drive list failed";
    return {
      files: listSampleDriveFiles(),
      stub: true,
      notes: `${message}. Falling back to sample Drive stubs.`,
    };
  }
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

  const sa = parseServiceAccount();
  if (!sa) {
    return {
      text: `(No text available for ${listed.name}.)`,
      scannedPdf: false,
      stub: true,
    };
  }

  try {
    const token = await getAccessToken(sa);
    const isGoogleDoc = listed.mime.startsWith(
      "application/vnd.google-apps.",
    );
    let url: string;
    if (isGoogleDoc) {
      const exportMime =
        listed.mime === "application/vnd.google-apps.spreadsheet"
          ? "text/csv"
          : "text/plain";
      url = `https://www.googleapis.com/drive/v3/files/${listed.drive_id}/export?mimeType=${encodeURIComponent(exportMime)}`;
    } else {
      url = `https://www.googleapis.com/drive/v3/files/${listed.drive_id}?alt=media`;
    }
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Drive export failed (${res.status})`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const text = buf.toString("utf8");
    // Heuristic: PDF binary with almost no extractable text → scanned
    const printable = text.replace(/[^\x20-\x7E\n\r\t]/g, "");
    const scannedPdf =
      listed.mime === "application/pdf" && printable.trim().length < 40;
    return {
      text: scannedPdf
        ? `[Scanned PDF flagged for Jainam: ${listed.name}]`
        : printable || text,
      scannedPdf,
      stub: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "extract failed";
    return {
      text: `(Extract failed for ${listed.name}: ${message})`,
      scannedPdf: false,
      stub: true,
    };
  }
}
