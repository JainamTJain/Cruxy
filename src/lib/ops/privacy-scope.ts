import "server-only";
import { isAdminRole } from "@/lib/admin/permissions";
import type { Person, SessionPayload } from "@/lib/types";
import { listCaseRoles } from "@/lib/team/repository";

/**
 * Wave 6 privacy (Jainam, Nov 21):
 *
 * Shared across all three teams:
 *   claim nodes, claim maps, robustness scores, arg_edges / graph spine.
 *
 * Personal (self + case leads where the plan says so + coach/tech in admin view):
 *   mastery, Brier scores, score predictions, Socratic outcomes / sessions,
 *   personal phrasebook, personal flashcard FSRS state, private drift flags,
 *   redo scores, moderator drill answer text.
 *
 * Always private (tech admin only, or never to members):
 *   auth_codes, passcode copies, ai_calls, book_requests, material_requests,
 *   judge weights, voice sample bytes.
 *
 * Wave 7 also: research full text only for open / public domain licences;
 * mood events carry no personal fields (see privacy-licence.ts).
 */

export type PrivacyClass =
  | "shared_team"
  | "personal_learning"
  | "tech_only";

/** Classify a Wave 6 / learning field for route authors. */
export function privacyClassFor(field: string): PrivacyClass {
  const f = field.toLowerCase();
  if (
    f.includes("auth_code") ||
    f.includes("passcode") ||
    f.includes("ai_call") ||
    f.includes("book_request") ||
    f.includes("material_request") ||
    f.includes("judge_weight") ||
    f.includes("calibration") ||
    f.includes("voice_sample")
  ) {
    return "tech_only";
  }
  if (
    f.includes("mastery") ||
    f.includes("brier") ||
    f.includes("prediction") ||
    f.includes("socratic") ||
    f.includes("phrasebook") ||
    f.includes("card_review") ||
    f.includes("outcome") ||
    f.includes("redo")
  ) {
    return "personal_learning";
  }
  // Robustness, claim nodes, arg_edges, graph.
  return "shared_team";
}

export function isAdminViewer(
  person: Person | null | undefined,
  session: SessionPayload,
): boolean {
  return Boolean(
    person && isAdminRole(person.role) && session.adminView,
  );
}

export function isTechAdminViewer(
  person: Person | null | undefined,
  session: SessionPayload,
): boolean {
  return Boolean(
    person && person.role === "tech_admin" && session.adminView,
  );
}

/** True when viewer is lead_1 or lead_2 for the case on that team. */
export async function isCaseLead(opts: {
  personId: string;
  teamId: string;
  caseId: string;
}): Promise<boolean> {
  const roles = await listCaseRoles(opts.teamId);
  return roles.some(
    (r) =>
      r.person_id === opts.personId &&
      r.case_id === opts.caseId &&
      (r.role === "lead_1" || r.role === "lead_2"),
  );
}

/**
 * Personal learning rows (mastery, Brier, predictions, Socratic outcomes).
 * Visible to: the person, case leads (when caseId given), coach/tech in admin view.
 */
export async function canViewPersonalLearning(opts: {
  viewer: Person;
  session: SessionPayload;
  subjectPersonId: string;
  teamId?: string | null;
  caseId?: string | null;
}): Promise<boolean> {
  if (opts.viewer.id === opts.subjectPersonId) return true;
  if (isAdminViewer(opts.viewer, opts.session)) return true;
  if (opts.teamId && opts.caseId) {
    return isCaseLead({
      personId: opts.viewer.id,
      teamId: opts.teamId,
      caseId: opts.caseId,
    });
  }
  return false;
}

/**
 * Mastery map grid (Wave 6 E): leads see their case; Dr. B and Jainam see all;
 * members see only their own row.
 */
export async function canViewMasteryMap(opts: {
  viewer: Person;
  session: SessionPayload;
  subjectPersonId: string;
  teamId: string;
  caseId: string;
}): Promise<boolean> {
  if (opts.viewer.id === opts.subjectPersonId) return true;
  if (isAdminViewer(opts.viewer, opts.session)) return true;
  return isCaseLead({
    personId: opts.viewer.id,
    teamId: opts.teamId,
    caseId: opts.caseId,
  });
}

/** Strip score predictions from a judge card unless the viewer may see them. */
export function redactPredictions<T extends { predictions?: unknown; created_by?: string | null }>(
  card: T,
  opts: { viewerPersonId: string; adminViewer: boolean },
): T {
  if (opts.adminViewer) return card;
  if (card.created_by && card.created_by === opts.viewerPersonId) return card;
  if (card.predictions == null) return card;
  return { ...card, predictions: undefined };
}

/** Filter drift flags: private_to_leads stays with leads and admins. */
export function filterDriftFlagsForViewer<
  T extends { private_to_leads: boolean; person_id: string | null },
>(
  flags: T[],
  opts: {
    viewerPersonId: string;
    adminViewer: boolean;
    isLead: boolean;
  },
): T[] {
  return flags.filter((f) => {
    if (!f.private_to_leads) return true;
    if (opts.adminViewer || opts.isLead) return true;
    return f.person_id === opts.viewerPersonId;
  });
}
