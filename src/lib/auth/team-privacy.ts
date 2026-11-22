/**
 * Team privacy (docs/decisions.md, Nov 21 2026): members see only their own
 * team's work. Dr. B and Jainam (admin view) see every team.
 * Pure helpers — safe for client and server.
 */
import type { Person, Role, SessionPayload } from "@/lib/types";

function isAdmin(role: Role): boolean {
  return role === "tech_admin" || role === "coach_admin";
}

/** True when the viewer may open every team's case materials. */
export function canSeeAllTeams(
  person: Pick<Person, "role"> | null,
  session: Pick<SessionPayload, "adminView" | "role"> | null,
): boolean {
  if (!person || !session) return false;
  return session.adminView && isAdmin(session.role);
}

/**
 * Resolve which teamId a request may use.
 * Members are forced to their own team. Admins in admin view may pick any.
 * Returns null when the person has no team and is not an admin chooser.
 */
export function resolveVisibleTeamId(opts: {
  person: Pick<Person, "team_id" | "role">;
  session: Pick<SessionPayload, "teamId" | "adminView" | "role">;
  requested: string | null | undefined;
}): { teamId: string | null; denied: boolean } {
  const own = opts.person.team_id ?? opts.session.teamId ?? null;
  if (canSeeAllTeams(opts.person, opts.session) && opts.requested) {
    return { teamId: opts.requested, denied: false };
  }
  if (opts.requested && own && opts.requested !== own) {
    return { teamId: own, denied: true };
  }
  return { teamId: own, denied: false };
}

/** Writes: own team, or admin view. */
export function canWriteTeamData(
  person: Pick<Person, "team_id" | "role">,
  session: Pick<SessionPayload, "teamId" | "adminView" | "role">,
  teamId: string,
): boolean {
  if (canSeeAllTeams(person, session)) return true;
  const own = person.team_id ?? session.teamId;
  return Boolean(own && own === teamId);
}

export function isCoachOrTech(role: Role): boolean {
  return isAdmin(role);
}
