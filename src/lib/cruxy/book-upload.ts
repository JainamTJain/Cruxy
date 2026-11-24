/**
 * F-105: Jainam uploads a PDF for a book request → Crux uploads storage → digest.
 * Drive SA is read-only; archive lives in the crux-uploads bucket under
 * /Crux uploads/ and is digested like any Drive file.
 *
 * Wave 7: books are closed sources. Keep the PDF in crux-uploads for the tech
 * admin. Store only a citation plus a short quote in the library. Never put
 * the full book text into library passages or Deeper reading for the teams.
 */
import "server-only";

import { randomUUID } from "crypto";
import { digestListedFile } from "@/lib/library/digest";
import { checksumOf } from "@/lib/library/embeddings";
import {
  listBookRequests,
  replaceFilePassages,
  saveBookRequest,
  saveLibraryFile,
} from "@/lib/db/library-repository";
import { listCases, logActivity } from "@/lib/db/repository";
import { clipClosedQuote } from "@/lib/ops/privacy-licence";
import { downloadBytes, uploadBytes } from "@/lib/ops/storage";
import type { DriveListedFile } from "@/lib/library/types";
import { nowIso } from "@/lib/utils";

/** Where a book's PDF is stored: named after the book, not the download. */
export function bookUploadPath(book: { id: string; title: string }, filename: string): string {
  const ext = (filename.match(/\.(pdf|txt|docx|epub)$/i)?.[1] ?? "pdf").toLowerCase();
  const safe = book.title.replace(/[^\w.\- ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "book";
  return `Crux uploads/${book.id}/${safe}.${ext}`;
}

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

  // Extract only to confirm the file is readable and to pick one short quote.
  // Closed books must not store full text in the shared library or Deeper reading.
  let extracted = (input.textContent ?? "").trim();
  if (!extracted && bytes && !/\.txt$/i.test(uploadPath)) {
    const { fileToText } = await import("@/lib/reading/import-reading");
    extracted = await fileToText({ name: safeName, type: "", bytes }).catch(() => "");
  }
  const readable = extracted.length >= 200 || Boolean((input.textContent ?? "").trim());
  const quote = clipClosedQuote(extracted);
  const cases = await listCases();
  const header = [
    `Uploaded PDF for book request: ${book.title}.`,
    book.chapter ? `Chapter: ${book.chapter}` : "",
    book.reason ?? "",
    "Full PDF is stored in Crux uploads for the tech admin. Short quotes only in the product; the rest is paraphrased.",
  ]
    .filter(Boolean)
    .join("\n");
  const text = quote
    ? `${header}\n\nShort quote: "${quote}"`
    : [
        header,
        readable
          ? "No short quote was kept from this file."
          : "The PDF is stored in Crux uploads but its text could not be read (it may be a scan). Paste a short chapter quote if needed.",
      ].join("\n");

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

  // Do not add the book to Deeper reading or store full passages for teams.
  // Wave 7: closed / book sources stay citation + short quote only.

  await logActivity({
    person_id: input.personId,
    action: "book_request_uploaded",
    target: book.id,
    meta: {
      library_file_id: digested.file.id,
      upload_path: uploadPath,
      chars: extracted.length,
      readable,
      quote_words: quote ? quote.split(/\s+/).filter(Boolean).length : 0,
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
