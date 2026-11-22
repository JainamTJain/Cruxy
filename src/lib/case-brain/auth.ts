import { canSeeAllTeams } from "@/lib/auth/team-privacy";
import { getSession } from "@/lib/auth/session";
import { getPersonById, listTeams } from "@/lib/db/repository";
import type { Person, SessionPayload } from "@/lib/types";

export async function requireMemberSession(): Promise<
  | { ok: true; session: SessionPayload; teamId: string; person: Person }
  | { ok: false; status: number; error: string }
> {
  const session = await getSession();
  if (!session) {
    return { ok: false, status: 401, error: "Sign in required." };
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return { ok: false, status: 401, error: "Unknown person." };
  }
  let teamId = person.team_id ?? session.teamId;
  // Dr. B / Jainam may have no team row; they still open case materials in admin view.
  if (!teamId && canSeeAllTeams(person, session)) {
    const teams = await listTeams();
    teamId = teams[0]?.id ?? null;
  }
  if (!teamId) {
    return {
      ok: false,
      status: 403,
      error: "Case brain edits need a team membership.",
    };
  }
  return { ok: true, session, teamId, person };
}
