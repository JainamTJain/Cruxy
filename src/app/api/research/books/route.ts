import { NextResponse } from "next/server";
import {
  requireSession,
  requireTechAdmin,
} from "@/lib/auth/require-session";
import { fulfillBookRequestWithPdf } from "@/lib/cruxy/book-upload";
import {
  listBookRequests,
  listCases,
  updateBookRequestStatus,
} from "@/lib/db/library-repository";
import { logActivity } from "@/lib/db/repository";

export const runtime = "nodejs";
// Reading and indexing a whole book can take a while.
export const maxDuration = 300;

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const denied = requireTechAdmin(auth.session);
  if (denied) return denied;

  const [books, cases] = await Promise.all([
    listBookRequests(),
    listCases(),
  ]);
  const caseMap = new Map(cases.map((c) => [c.id, c]));

  return NextResponse.json({
    books: books.map((b) => ({
      ...b,
      case_number: b.case_id ? caseMap.get(b.case_id)?.number ?? null : null,
      case_title: b.case_id ? caseMap.get(b.case_id)?.title ?? null : null,
    })),
  });
}

export async function PATCH(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const denied = requireTechAdmin(auth.session);
  if (denied) return denied;

  const body = (await req.json()) as {
    id?: string;
    status?: "open" | "fulfilled" | "dismissed";
  };
  if (!body.id || !body.status) {
    return NextResponse.json(
      { error: "id and status required" },
      { status: 400 },
    );
  }

  const updated = await updateBookRequestStatus(body.id, body.status);
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await logActivity({
    person_id: auth.session.personId,
    action: "book_request_updated",
    target: body.id,
    meta: { status: body.status },
  });

  return NextResponse.json({ book: updated });
}

/** Jainam uploads a PDF; digests into Crux uploads (F-105). */
export async function POST(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const denied = requireTechAdmin(auth.session);
  if (denied) return denied;

  // Large PDFs go straight from the browser to storage: first "sign" for an
  // upload URL, then "digest" once the file is there.
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as {
      action?: "sign" | "digest";
      id?: string;
      filename?: string;
      path?: string;
    };
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    try {
      if (body.action === "sign") {
        const { bookUploadPath } = await import("@/lib/cruxy/book-upload");
        const { createSignedUpload } = await import("@/lib/ops/storage");
        const book = (await listBookRequests()).find((b) => b.id === body.id);
        if (!book) return NextResponse.json({ error: "Book request not found." }, { status: 404 });
        const signed = await createSignedUpload({
          bucket: "crux-uploads",
          path: bookUploadPath(book, body.filename ?? "book.pdf"),
        });
        if (!signed) return NextResponse.json({ direct: false });
        return NextResponse.json({ direct: true, ...signed });
      }
      if (body.action === "digest") {
        if (!body.path) return NextResponse.json({ error: "path required" }, { status: 400 });
        const result = await fulfillBookRequestWithPdf({
          bookRequestId: body.id,
          personId: auth.session.personId,
          filename: body.path.split("/").pop() ?? "book.pdf",
          storedPath: body.path,
        });
        return NextResponse.json({ ok: true, ...result });
      }
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed." }, { status: 400 });
    }
  }

  const form = await req.formData();
  const id = String(form.get("id") ?? "");
  const file = form.get("file");
  const pastedText = String(form.get("text") ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  if (!(file instanceof File) && !pastedText) {
    return NextResponse.json(
      { error: "Upload a PDF or paste the chapter text." },
      { status: 400 },
    );
  }

  const bytes =
    file instanceof File
      ? new Uint8Array(await file.arrayBuffer())
      : new TextEncoder().encode(pastedText);
  const filename =
    file instanceof File
      ? file.name || "book.pdf"
      : `${id}.txt`;

  try {
    const result = await fulfillBookRequestWithPdf({
      bookRequestId: id,
      personId: auth.session.personId,
      filename,
      bytes,
      textContent: pastedText || null,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
