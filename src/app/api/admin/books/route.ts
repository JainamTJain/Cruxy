import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canRead, canWrite } from "@/lib/admin/permissions";
import {
  getPersonById,
  listBookRequests,
  listDriveSortQueue,
  logActivity,
  sortDriveItem,
} from "@/lib/db/repository";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canRead(person.role, "book_requests")) {
    return NextResponse.json(
      { error: "Book requests are technical admin only." },
      { status: 403 },
    );
  }
  const [books, queue] = await Promise.all([
    listBookRequests(),
    listDriveSortQueue(),
  ]);
  return NextResponse.json({ books, queue });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canWrite(person.role, "book_requests")) {
    return NextResponse.json({ error: "Tech admin only" }, { status: 403 });
  }
  const body = (await req.json()) as { sortId?: string };
  if (!body.sortId) {
    return NextResponse.json({ error: "Missing sortId" }, { status: 400 });
  }
  const item = await sortDriveItem(body.sortId, "sorted");
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await logActivity({
    person_id: person.id,
    action: "drive_sorted",
    target: item.id,
    meta: { filename: item.filename },
  });
  return NextResponse.json({ ok: true, item });
}
