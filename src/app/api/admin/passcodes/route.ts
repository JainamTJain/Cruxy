import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getPersonById,
  listPasscodeRows,
  listTeams,
} from "@/lib/db/repository";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || person.role !== "tech_admin") {
    return NextResponse.json({ error: "Tech admin only" }, { status: 403 });
  }

  const [rows, teams] = await Promise.all([listPasscodeRows(), listTeams()]);
  return NextResponse.json({
    teams,
    people: rows.map(({ person: p, code }) => ({
      id: p.id,
      name: p.name,
      team_id: p.team_id,
      role: p.role,
      hasPasscode: Boolean(code && !code.must_choose && code.encrypted_copy),
      mustChoose: Boolean(code?.must_choose),
      setAt: code?.set_at ?? null,
      lastSignIn: p.last_sign_in_at,
      lastRevealedAt: code?.last_revealed_at ?? null,
    })),
  });
}
