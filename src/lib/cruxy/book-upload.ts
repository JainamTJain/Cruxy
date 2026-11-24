/**
 * F-105: Jainam uploads a PDF for a book request → Crux uploads storage → digest.
 * Drive SA is read-only; archive lives in the crux-uploads bucket under
 * /Crux uploads/ and is digested like any Drive file.
 */
import "server-only";

import { randomUUID } from "crypto";
import { digestListedFile } from "@/lib/library/digest";
import { checksumOf } from "@/lib/library/embeddings";
import {
  listBookRequests,
  listLibraryFiles,
  replaceFilePassages,
  saveBookRequest,
  saveLibraryFile,
} from "@/lib/db/library-repository";
import { listCases, logActivity } from "@/lib/db/repository";
import { downloadBytes, uploadBytes } from "@/lib/ops/storage";
import type { DriveListedFile } from "@/lib/library/types";
import { nowIso } from "@/lib/utils";

/** Where a book's PDF is stored: named after the book, not the download. */
export function bookUploadPath(book: { id: string; title: string }, filename: string): string {
  const ext = (filename.match(/\.(pdf|txt|docx|epub)$/i)?.[1] ?? "pdf").toLowerCase();
  const safe = book.title.replace(/[^\w.\- ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "book";
  return `Crux uploads/${book.id}/${safe}.${ext}`;
}

/** Most of a book, kept within what the digest can index in one run. */
const MAX_BOOK_CHARS = 250_000;

export async function fulfillBookRequestWithPdf(input: {
  bookRequestId: string;
  personId: string;
  filename: string;
  /** The file itself, or storedPath when the browser already sent it to storage. */
  bytes?: Uint8Array | null;
  storedPath?: string | null;
  textContent?: string | null;
}): Promise<{
  bookId: string;
  libraryFileId: string;
  uploadPath: string;
  chars: number;
  readable: boolean;
}> {
  const books = await listBookRequests();
  const book = books.find((b) => b.id === input.bookRequestId);
  if (!book) throw new Error("Book request not found.");

  let bytes = input.bytes ?? null;
  let uploadPath: string;
  if (input.storedPath) {
    if (!input.storedPath.startsWith(`Crux uploads/${book.id}/`)) throw new Error("That upload does not belong to this book.");
    uploadPath = input.storedPath;
    const got = await downloadBytes("crux-uploads", uploadPath);
    if (!got) throw new Error("The upload did not reach storage. Try again.");
    bytes = new Uint8Array(got);
  } else {
    if (!bytes) throw new Error("Upload a PDF or paste the chapter text.");
    uploadPath = bookUploadPath(book, input.filename);
    await uploadBytes({
      bucket: "crux-uploads",
      path: uploadPath,
      bytes,
      contentType: /\.txt$/i.test(uploadPath) ? "text/plain" : "application/pdf",
      upsert: true,
    });
  }
  const safeName = uploadPath.split("/").pop() ?? "book.pdf";

  // Read the book itself so Cruxy can use it, not just a note that it exists.
  const { storableText } = await import("@/lib/reading/import-reading");
  let extracted = storableText((input.textContent ?? "").trim());
  if (!extracted && bytes && !/\.txt$/i.test(uploadPath)) {
    const { fileToText } = await import("@/lib/reading/import-reading");
    extracted = await fileToText({ name: safeName, type: "", bytes }).catch(() => "");
  }
  const readable = extracted.length >= 1000;
  const cases = await listCases();
  const existing = await listLibraryFiles();
  const header = [
    `${book.title}.`,
    book.chapter ? `Requested for: ${book.chapter}` : "",
    book.reason ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  const text = readable
    ? `${header}\n\n${extracted.slice(0, MAX_BOOK_CHARS)}`
    : [header, "The PDF is stored in Crux uploads but its text could not be read (it may be a scan). Paste the chapter text to make it searchable."].join("\n");

  const listed: DriveListedFile = {
    drive_id: `upload:${book.id}`,
    name: book.title,
    path: `/Crux uploads/${safeName}`,
    mime: "application/pdf",
    modified_at: nowIso(),
    checksum: checksumOf(`${book.id}|${bytes?.byteLength ?? 0}|${checksumOf(text)}`),
    text_content: text,
  };

  const digested = await digestListedFile({
    listed,
    text,
    scannedPdf: !readable,
    cases,
    existing: null,
    personId: input.personId,
    skipAi: false,
  });

  if (book.case_id) {
    const c = cases.find((x) => x.id === book.case_id);
    if (c && !digested.file.case_ids.includes(c.id)) {
      digested.file.case_ids = [...digested.file.case_ids, c.id];
      digested.file.case_numbers = [
        ...new Set([...digested.file.case_numbers, c.number]),
      ];
    }
  }
  digested.file.type = "research";
  digested.file.id = digested.file.id || randomUUID();

  await saveLibraryFile(digested.file);
  await replaceFilePassages(digested.file.id, digested.passages);

  const updated = {
    ...book,
    status: "fulfilled" as const,
    upload_path: uploadPath,
    library_file_id: digested.file.id,
  };
  await saveBookRequest(updated);

  // The book joins the case's Deeper reading, readable in the reading room
  // with Cruxy's digest and case bookmarks.
  let openReadingId: string | null = null;
  if (readable && book.case_id) {
    const { addBookReading } = await import("@/lib/reading/open-reading");
    const { ensureWebText } = await import("@/lib/reading/reading-room");
    const reading = await addBookReading({
      caseId: book.case_id,
      bookId: book.id,
      title: book.chapter ? `${book.title}: ${book.chapter}` : book.title,
      why: book.reason ?? null,
    });
    openReadingId = reading.id;
    await ensureWebText(
      { id: reading.id, case_id: reading.case_id, url: reading.url, title: reading.title },
      input.personId,
      extracted,
    );
  }

  await logActivity({
    person_id: input.personId,
    action: "book_request_uploaded",
    target: book.id,
    meta: {
      library_file_id: digested.file.id,
      upload_path: uploadPath,
      chars: extracted.length,
      readable,
      open_reading_id: openReadingId,
    },
  });

  return {
    bookId: book.id,
    libraryFileId: digested.file.id,
    uploadPath,
    chars: extracted.length,
    readable,
  };
}
