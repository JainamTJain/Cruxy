import type { Person, Role } from "@/lib/types";

/** Areas from the build-spec permissions table. */
export type AdminArea =
  | "teams_people"
  | "sessions"
  | "moderator_questions"
  | "consent_status"
  | "program_analytics"
  | "passcodes"
  | "spend"
  | "book_requests"
  | "calibration"
  | "models"
  | "activity_log"
  | "is_crux_working"
  | "weekly_summary"
  | "competition_log"
  | "season_rollover"
  | "cruxy_admin";

const PERMISSIONS: Record<
  AdminArea,
  { tech: "yes" | "no" | "read"; coach: "yes" | "no" | "read" }
> = {
  teams_people: { tech: "yes", coach: "yes" },
  sessions: { tech: "yes", coach: "yes" },
  moderator_questions: { tech: "yes", coach: "yes" },
  consent_status: { tech: "yes", coach: "yes" },
  program_analytics: { tech: "yes", coach: "yes" },
  passcodes: { tech: "yes", coach: "no" },
  spend: { tech: "yes", coach: "no" },
  book_requests: { tech: "yes", coach: "no" },
  calibration: { tech: "yes", coach: "no" },
  models: { tech: "yes", coach: "no" },
  activity_log: { tech: "yes", coach: "read" },
  is_crux_working: { tech: "yes", coach: "no" },
  weekly_summary: { tech: "yes", coach: "yes" },
  competition_log: { tech: "yes", coach: "yes" },
  season_rollover: { tech: "yes", coach: "no" },
  cruxy_admin: { tech: "yes", coach: "yes" },
};

export function permissionFor(
  role: Role,
  area: AdminArea,
): "yes" | "no" | "read" {
  if (role === "member") return "no";
  const row = PERMISSIONS[area];
  return role === "tech_admin" ? row.tech : row.coach;
}

export function canWrite(role: Role, area: AdminArea): boolean {
  return permissionFor(role, area) === "yes";
}

export function canRead(role: Role, area: AdminArea): boolean {
  const p = permissionFor(role, area);
  return p === "yes" || p === "read";
}

export function isAdminRole(role: Role): boolean {
  return role === "tech_admin" || role === "coach_admin";
}

export function assertTechAdmin(person: Person | null): person is Person {
  return Boolean(person && person.role === "tech_admin");
}

export function assertAdmin(person: Person | null): person is Person {
  return Boolean(person && isAdminRole(person.role));
}

export const PERMISSION_TABLE = [
  {
    area: "Teams and people",
    jainam: "Yes",
    drB: "Yes",
  },
  {
    area: "Sessions",
    jainam: "Yes",
    drB: "Yes",
  },
  {
    area: "Moderator questions",
    jainam: "Yes",
    drB: "Yes",
  },
  {
    area: "Consent status",
    jainam: "Yes",
    drB: "Yes",
  },
  {
    area: "Program analytics",
    jainam: "Yes",
    drB: "Yes",
  },
  {
    area: "Passcodes (see / reset / starter)",
    jainam: "Yes",
    drB: "No",
  },
  {
    area: "Spend caps and pause research",
    jainam: "Yes",
    drB: "No",
  },
  {
    area: "Book requests / Drive sorting",
    jainam: "Yes",
    drB: "No",
  },
  {
    area: "Calibration view",
    jainam: "Yes",
    drB: "No",
  },
  {
    area: "Model settings (tiers)",
    jainam: "Yes",
    drB: "No",
  },
  {
    area: "Activity log",
    jainam: "Yes",
    drB: "Read only",
  },
] as const;
