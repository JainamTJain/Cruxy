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
import { uploadBytes } from "@/lib/ops/storage";
import type { DriveListedFile } from "@/lib/library/types";
import { nowIso } from "@/lib/utils";

export async function fulfillBookRequestWithPdf(input: {
  bookRequestId: string;
  personId: string;
  filename: string;
  bytes: Uint8Array;
  textContent?: string | null;
}): Promise<{
  bookId: string;
  libraryFileId: string;
  uploadPath: string;
}> {
  const books = await listBookRequests();
  const book = books.find((b) => b.id === input.bookRequestId);
  if (!book) throw new Error("Book request not found.");

  const safeName = input.filename.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  const uploadPath = `Crux uploads/${book.id}/${safeName}`;
  await uploadBytes({
    bucket: "crux-uploads",
    path: uploadPath,
    bytes: input.bytes,
    contentType: "application/pdf",
    upsert: true,
  });

  const cases = await listCases();
  const existing = await listLibraryFiles();
  const text =
    (input.textContent ?? "").trim() ||
    [
      `Uploaded PDF for book request: ${book.title}.`,
      book.chapter ? `Chapter: ${book.chapter}` : "",
      book.reason ?? "",
      "Full PDF is stored in Crux uploads. Digested as a research source; short quotes only in the UI.",
    ]
      .filter(Boolean)
      .join("\n");

  const listed: DriveListedFile = {
    drive_id: `upload:${book.id}`,
    name: book.title,
    path: `/Crux uploads/${safeName}`,
    mime: "application/pdf",
    modified_at: nowIso(),
    checksum: checksumOf(
      `${book.id}|${input.bytes.byteLength}|${checksumOf(text)}`,
    ),
    text_content: text,
  };

  const digested = await digestListedFile({
    listed,
    text,
    scannedPdf: !input.textContent,
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

  await logActivity({
    person_id: input.personId,
    action: "book_request_uploaded",
    target: book.id,
    meta: {
      library_file_id: digested.file.id,
      upload_path: uploadPath,
    },
  });

  return {
    bookId: book.id,
    libraryFileId: digested.file.id,
    uploadPath,
  };
}
