import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById, listAuthCodesMeta } from "@/lib/db/repository";

export const runtime = "nodejs";

/**
 * Intentionally gated: members must not read auth_codes.
 * Tech admin (admin view) only — and even then hashes only, never plaintext.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person || person.role !== "tech_admin" || !session.adminView) {
    return NextResponse.json(
      { error: "Members cannot read auth_codes." },
      { status: 403 },
    );
  }
  const codes = await listAuthCodesMeta();
  return NextResponse.json({
    auth_codes: codes.map((c) => ({
      id: c.id,
      kind: c.kind,
      person_id: c.person_id,
      has_hash: Boolean(c.hash),
      has_encrypted_copy: Boolean(c.encrypted_copy),
      must_choose: c.must_choose,
      set_at: c.set_at,
      // never return hash or encrypted_copy plaintext material to client in this list
    })),
  });
}
