import type { Person, Role, SessionPayload } from "@/lib/types";
import { effectiveRole } from "@/lib/db/repository";
import {
  canRead,
  canWrite,
  isAdminRole,
  type AdminArea,
} from "@/lib/admin/permissions";

/**
 * Role capabilities for F-014 to F-020.
 * Admin JWT always keeps people.role; adminView gates what the UI and routes allow.
 */

export function roleForSession(
  person: Person,
  session: SessionPayload,
): Role {
  return effectiveRole(person, session.adminView);
}

export function viewingAsMember(session: SessionPayload): boolean {
  return (
    (session.role === "tech_admin" || session.role === "coach_admin") &&
    !session.adminView
  );
}

export function canUseAdminSwitch(person: Person): boolean {
  return isAdminRole(person.role);
}

/** Session codes are admin-only (never members, never member-view). */
export function canSeeSessionCodes(
  person: Person,
  session: SessionPayload,
): boolean {
  return isAdminRole(person.role) && session.adminView;
}

/** Truth Source writes only for the person's own team. */
export function canEditTruthSources(
  person: Person,
  session: SessionPayload,
  truthTeamId: string,
): boolean {
  if (isAdminRole(person.role) && session.adminView) return true;
  void session;
  return Boolean(person.team_id && person.team_id === truthTeamId);
}

export function canBorrowFromOtherTeams(
  person: Person,
  session: SessionPayload,
): boolean {
  const role = roleForSession(person, session);
  return role === "member" || isAdminRole(person.role);
}

export function canTakeAttendance(
  person: Person,
  session: SessionPayload,
): boolean {
  return isAdminRole(person.role) && session.adminView;
}

export function canOpenPasscodesPanel(
  person: Person,
  session: SessionPayload,
): boolean {
  return person.role === "tech_admin" && session.adminView;
}

export function canChangeSpendOrFeedBooks(
  person: Person,
  session: SessionPayload,
): boolean {
  return person.role === "tech_admin" && session.adminView;
}

export function adminAreaAccess(
  person: Person,
  session: SessionPayload,
  area: AdminArea,
): "yes" | "no" | "read" {
  if (!session.adminView) return "no";
  if (!canRead(person.role, area)) return "no";
  if (canWrite(person.role, area)) return "yes";
  return "read";
}

/** Judge portal: only the session they were let into (guest token or member). */
export function assertJudgeSessionAccess(opts: {
  allowedSessionId: string;
  requestedSessionId: string;
}): boolean {
  return opts.allowedSessionId === opts.requestedSessionId;
}

export const ROLE_SUMMARY = {
  tech_admin: {
    can: [
      "Everything coach admin can",
      "Everyone's passcodes (see and reset)",
      "Spend caps and API keys",
      "Feeding books",
      "Full activity log",
    ],
    cannot: [] as string[],
  },
  coach_admin: {
    can: [
      "See everything",
      "Create and run sessions",
      "Take attendance",
      "See session codes",
      "Add moderator questions",
      "Weekly summary if opted in",
    ],
    cannot: ["Change passcodes or spend caps", "Feed books"],
  },
  member: {
    can: [
      "Everything for their own team",
      "Read, comment on and borrow from every other team",
    ],
    cannot: ["Edit another team's Truth Sources", "See session codes"],
  },
  judge: {
    can: ["Score the session they were let into"],
    cannot: ["See anything else in Crux"],
  },
} as const;
