/**
 * Ensure the viewing team has at least claim-map v1 so "I've got vN" works
 * from the case brain. Uses the team repository publish path (sample + supabase).
 */
import { getCaseBrain } from "@/lib/case-brain/service";
import {
  getCurrentClaimMap,
  publishClaimMapEdit,
} from "@/lib/team/repository";
import type { ClaimMapBody } from "@/lib/team/types";

export async function ensureClaimMapVersion(args: {
  teamId: string;
  caseId: string;
  personId: string;
}): Promise<void> {
  const current = await getCurrentClaimMap(args.teamId, args.caseId);
  if (current) return;

  const brain = await getCaseBrain(args.teamId, args.caseId);
  if (brain.claims.length === 0) return;

  const body: ClaimMapBody = {
    claims: brain.claims.map((node, i) => ({
      key: `c${i + 1}`,
      text: node.claim.text,
      logic_line: node.claim.logic_line ?? "",
      supports: node.supports.map((s, j) => ({
        key: `c${i + 1}s${j + 1}`,
        text: s.support.text,
      })),
    })),
  };

  await publishClaimMapEdit({
    teamId: args.teamId,
    caseId: args.caseId,
    body,
    changeSummary: "Published from case brain (initial version)",
    actorId: args.personId,
  });
}
