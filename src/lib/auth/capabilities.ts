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

/**
 * One-pager edits: that team's members, or Dr. B / Jainam in admin view.
 * Other teams never see another team's page (team privacy); when an admin
 * opens one, they can edit it.
 */
export function canEditOnePager(
  person: Person,
  session: SessionPayload,
  onePagerTeamId: string,
): boolean {
  if (isAdminRole(person.role) && session.adminView) return true;
  // Tech / coach JWT still counts even if adminView was lost mid-request.
  if (isAdminRole(session.role) && session.adminView) return true;
  const teamId = person.team_id ?? session.teamId;
  return Boolean(teamId && teamId === onePagerTeamId);
}

/**
 * Case roles (lead 1/2, counter-arguer, supporter): any member of that team,
 * or an admin in admin view. Admin member-view is limited to the active team.
 */
export function canSetCaseRole(
  person: Person,
  session: SessionPayload,
  teamId: string,
): boolean {
  if (isAdminRole(person.role) && session.adminView) return true;
  if (viewingAsMember(session)) {
    return Boolean(session.teamId && session.teamId === teamId);
  }
  return Boolean(session.teamId && session.teamId === teamId);
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

/**
 * Wave 9 E: Dr. B (coach admin in admin view) or a case lead on the team
 * may add calendar events and availability polls.
 */
export function canManageTeamCalendar(
  person: Person,
  session: SessionPayload,
  teamId: string,
  isCaseLead: boolean,
): boolean {
  if (person.role === "coach_admin" && session.adminView) return true;
  if (person.role === "tech_admin" && session.adminView) return true;
  if (!session.teamId || session.teamId !== teamId) {
    if (!(isAdminRole(person.role) && session.adminView)) return false;
  }
  return isCaseLead || (isAdminRole(person.role) && session.adminView);
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
      "Set and change case roles (leads, counter-arguer, supporter)",
      "Read, comment on and borrow from every other team",
    ],
    cannot: ["Edit another team's Evidence Library", "See session codes"],
  },
  judge: {
    can: ["Score the session they were let into"],
    cannot: ["See anything else in Crux"],
  },
} as const;
