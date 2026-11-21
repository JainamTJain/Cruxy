/**
 * Publish the live claim map from case brain as a new version.
 * Used when a member records "what changed and why" on the case brain.
 */
import { getCaseBrain } from "@/lib/case-brain/service";
import { publishClaimMapEdit } from "@/lib/team/repository";
import type { ClaimMapBody, ClaimMapVersion } from "@/lib/team/types";

export function claimMapBodyFromBrain(
  brain: Awaited<ReturnType<typeof getCaseBrain>>,
): ClaimMapBody {
  return {
    claims: brain.claims.map((node, i) => {
      const cc = node.counterclaims[0];
      const response = [cc?.concede, cc?.distinguish, cc?.rebut]
        .filter(Boolean)
        .join(" ");
      return {
        key: `c${i + 1}`,
        text: node.claim.text,
        logic_line: node.claim.logic_line ?? "",
        supports: node.supports.map((s, j) => ({
          key: `c${i + 1}s${j + 1}`,
          text: s.support.text,
        })),
        counterclaim_response: response || undefined,
      };
    }),
  };
}

export async function publishClaimMapFromBrain(args: {
  teamId: string;
  caseId: string;
  personId: string;
  changeSummary: string;
}): Promise<ClaimMapVersion> {
  const summary = args.changeSummary.trim();
  if (summary.length < 3) {
    throw new Error("Write one line on what changed and why.");
  }
  const brain = await getCaseBrain(args.teamId, args.caseId);
  if (brain.claims.length === 0) {
    throw new Error("No claim map to publish yet.");
  }
  return publishClaimMapEdit({
    teamId: args.teamId,
    caseId: args.caseId,
    body: claimMapBodyFromBrain(brain),
    changeSummary: summary,
    actorId: args.personId,
  });
}
