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
