import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import { isAdminViewer } from "@/lib/ops/privacy-scope";
import {
  listPersonSocraticOutcomes,
  summarizeSocraticOutcomesForWeek,
} from "@/lib/cruxy/socratic-outcomes";

export const runtime = "nodejs";

/**
 * Personal Socratic outcomes (Wave 6 J / I).
 * Members get only their own list and week summary.
 * Coach/tech in admin view may request another personId, or omit for org-wide week stats.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actor = await getPersonById(session.personId);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const requested = url.searchParams.get("personId");
  const admin = isAdminViewer(actor, session);

  let personId = session.personId;
  if (requested && requested !== session.personId) {
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    personId = requested;
  }

  // Members: personal week only. Admins without a personId get org-wide week
  // (Cruxy weekly self-review). Admins with personId get that person's week.
  const weekPersonId = admin && !requested ? null : personId;

  const [outcomes, week] = await Promise.all([
    listPersonSocraticOutcomes(personId),
    summarizeSocraticOutcomesForWeek({
      sinceDays: 7,
      personId: weekPersonId,
    }),
  ]);

  return NextResponse.json({
    personId,
    outcomes,
    week,
  });
}
