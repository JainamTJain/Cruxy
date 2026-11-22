import "server-only";
import { createNotification } from "@/lib/db/supabase/auth-extra";
import { listPeopleFull } from "@/lib/db/repository";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore } from "@/lib/db/sample-store";
import { listCaseRoles } from "@/lib/db/supabase/team";
import type { CaseRole } from "@/lib/case-brain/types";

/**
 * Notify teammates (especially leads) when a suggestion appears for their case.
 */
export async function notifyBriefSuggestionOnCase(opts: {
  teamId: string;
  caseId: string;
  authorId: string;
  proposalId: string;
}): Promise<void> {
  const people = await listPeopleFull();
  const roles = await loadCaseRoles(opts.teamId);
  const leadIds = new Set(
    roles
      .filter(
        (r) =>
          r.case_id === opts.caseId &&
          (r.role === "lead_1" ||
            r.role === "lead_2" ||
            String(r.role).toLowerCase().includes("lead")),
      )
      .map((r) => r.person_id),
  );

  const recipients = people.filter((p) => {
    if (p.id === opts.authorId) return false;
    if (p.team_id !== opts.teamId) return false;
    if (leadIds.size === 0) return true;
    return leadIds.has(p.id);
  });

  for (const person of recipients) {
    await createNotification({
      personId: person.id,
      kind: "brief_suggestion",
      title: "New suggestion on your Team Brief",
      body: "Open the case to review it. Nothing changes until someone accepts.",
      href: `/case-brain/${opts.caseId}`,
      payload: {
        proposal_id: opts.proposalId,
        case_id: opts.caseId,
        team_id: opts.teamId,
      },
      createdBy: opts.authorId,
    });
  }
}

async function loadCaseRoles(teamId: string): Promise<CaseRole[]> {
  if (isSampleDataMode()) {
    const store = await readStore();
    return ((store as { case_roles?: CaseRole[] }).case_roles ?? []).filter(
      (r) => r.team_id === teamId,
    );
  }
  return listCaseRoles(teamId);
}
