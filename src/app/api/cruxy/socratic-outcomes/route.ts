import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import {
  listPersonSocraticOutcomes,
  summarizeSocraticOutcomesForWeek,
} from "@/lib/cruxy/socratic-outcomes";

export const runtime = "nodejs";

/** Own Socratic outcomes (or any person when tech/coach admin in admin view). */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const requested = url.searchParams.get("personId");
  let personId = session.personId;
  if (requested && requested !== session.personId) {
    const actor = await getPersonById(session.personId);
    const admin =
      actor &&
      (actor.role === "tech_admin" || actor.role === "coach_admin") &&
      session.adminView;
    if (!admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    personId = requested;
  }

  const [outcomes, week] = await Promise.all([
    listPersonSocraticOutcomes(personId),
    summarizeSocraticOutcomesForWeek({ sinceDays: 7 }),
  ]);

  return NextResponse.json({
    personId,
    outcomes,
    week,
  });
}
