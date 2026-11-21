/**
 * F-106: open books (public domain / open access) fetched and digested.
 */
import { digestListedFile } from "@/lib/library/digest";
import { checksumOf } from "@/lib/library/embeddings";
import {
  listLibraryFiles,
  replaceFilePassages,
  saveLibraryFile,
} from "@/lib/db/library-repository";
import { listCases } from "@/lib/db/repository";
import type { DriveListedFile } from "@/lib/library/types";
import { nowIso } from "@/lib/utils";
import { fetchPageText } from "@/lib/cruxy/research-read";

const OPEN_HOSTS = [
  "gutenberg.org",
  "www.gutenberg.org",
  "openlibrary.org",
  "archive.org",
  "plato.stanford.edu",
  "iep.utm.edu",
  "arxiv.org",
  "export.arxiv.org",
];

export function isOpenAccessUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return OPEN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/**
 * Fetch an open-access page/book text and digest it into the library as a
 * research file under /Crux uploads/open-books/.
 */
export async function digestOpenBook(input: {
  url: string;
  title?: string | null;
  caseId?: string | null;
  personId?: string | null;
}): Promise<{ fileId: string | null; stub: boolean; reason?: string }> {
  if (!isOpenAccessUrl(input.url)) {
    return { fileId: null, stub: false, reason: "not_open_access" };
  }

  const existing = await listLibraryFiles();
  const already = existing.find(
    (f) =>
      f.path?.includes(input.url) ||
      f.drive_id === `open:${checksumOf(input.url)}`,
  );
  if (already) {
    return { fileId: already.id, stub: false, reason: "already_digested" };
  }

  const page = await fetchPageText(input.url);
  if (!page.ok || page.text.length < 200) {
    return { fileId: null, stub: true, reason: "fetch_failed" };
  }

  const cases = await listCases();
  const driveId = `open:${checksumOf(input.url)}`;
  const listed: DriveListedFile = {
    drive_id: driveId,
    name: input.title?.trim() || page.title || "Open book",
    path: `/Crux uploads/open-books/${listedSafeName(input.title || page.title)}`,
    mime: "text/plain",
    modified_at: nowIso(),
    checksum: checksumOf(page.text),
    text_content: page.text,
  };

  const digested = await digestListedFile({
    listed,
    text: page.text,
    scannedPdf: false,
    cases,
    existing: null,
    personId: input.personId ?? undefined,
    skipAi: true,
  });

  if (input.caseId) {
    const c = cases.find((x) => x.id === input.caseId);
    if (c && !digested.file.case_ids.includes(c.id)) {
      digested.file.case_ids = [...digested.file.case_ids, c.id];
      digested.file.case_numbers = [
        ...new Set([...digested.file.case_numbers, c.number]),
      ];
    }
  }
  digested.file.type = "research";

  await saveLibraryFile(digested.file);
  await replaceFilePassages(digested.file.id, digested.passages);

  return { fileId: digested.file.id, stub: false };
}

function listedSafeName(name: string): string {
  return (
    name
      .replace(/[^\w\s.-]+/g, "")
      .trim()
      .slice(0, 80) || "open-book"
  );
}
