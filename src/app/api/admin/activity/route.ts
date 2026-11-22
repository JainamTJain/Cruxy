import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getPersonById,
  listActivityLog,
  listPeoplePublic,
} from "@/lib/db/repository";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (
    !person ||
    (person.role !== "tech_admin" && person.role !== "coach_admin")
  ) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const [log, { people }] = await Promise.all([
    listActivityLog(80),
    listPeoplePublic(),
  ]);
  const names = new Map(people.map((p) => [p.id, p.name]));

  return NextResponse.json({
    entries: log
      .filter((e) => e.action !== "arg_edge_recorded")
      .map((e) => ({
        ...e,
        personName: e.person_id
          ? names.get(e.person_id) ?? "unknown"
          : "unknown",
      })),
    readOnly: person.role === "coach_admin",
  });
}
