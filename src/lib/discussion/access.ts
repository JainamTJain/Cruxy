import "server-only";
import { isAdminRole } from "@/lib/admin/permissions";
import type { Person, Role, SessionPayload } from "@/lib/types";

/**
 * Discussion is own-team only. Dr. B and Jainam in admin view may switch teams.
 * (docs/decisions.md — Team privacy and shared ideas)
 */
export function resolveDiscussionTeamId(
  person: Pick<Person, "team_id" | "role">,
  session: Pick<SessionPayload, "teamId" | "adminView" | "role">,
  requested: string | null | undefined,
): string | null {
  if (
    session.adminView &&
    isAdminRole(session.role) &&
    requested
  ) {
    return requested;
  }
  return person.team_id ?? session.teamId ?? null;
}

export function canWriteDiscussion(
  person: Pick<Person, "team_id" | "role">,
  session: Pick<SessionPayload, "teamId" | "adminView" | "role">,
  teamId: string,
): boolean {
  if (session.adminView && isAdminRole(session.role as Role)) return true;
  const own = person.team_id ?? session.teamId;
  return Boolean(own && own === teamId);
}

export function isDiscussionAdmin(
  person: Pick<Person, "role">,
  session: Pick<SessionPayload, "adminView">,
): boolean {
  return (
    (person.role === "tech_admin" || person.role === "coach_admin") &&
    session.adminView
  );
}
