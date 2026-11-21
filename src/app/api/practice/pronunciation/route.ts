import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { setPronunciationNote } from "@/lib/practice/glossary-extra";

/**
 * Set or clear people.pronunciation_note (F-230).
 * Self, or tech admin for anyone.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    personId?: string;
    note?: string | null;
  };
  const personId = body.personId?.trim() || session.personId;
  const isSelf = personId === session.personId;
  const isTech = session.role === "tech_admin" || session.adminView;
  if (!isSelf && !isTech) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await setPronunciationNote({
    personId,
    note: body.note ?? null,
    actorId: session.personId,
  });

  return NextResponse.json({ ok: true });
}
