import { NextResponse } from "next/server";
import {
  requireSession,
  requireTechAdmin,
} from "@/lib/auth/require-session";
import {
  listBookRequests,
  listCases,
  updateBookRequestStatus,
} from "@/lib/db/library-repository";
import { logActivity } from "@/lib/db/repository";

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
