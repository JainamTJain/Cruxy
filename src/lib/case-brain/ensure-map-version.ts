/**
 * Ensure the viewing team has at least claim-map v1 so "I've got vN" works
 * from the case brain. Uses the team repository publish path (sample + supabase).
 */
import { publishClaimMapFromBrain } from "@/lib/case-brain/publish-from-brain";
import { getCurrentClaimMap } from "@/lib/team/repository";

export async function ensureClaimMapVersion(args: {
  teamId: string;
  caseId: string;
  personId: string;
}): Promise<void> {
  const current = await getCurrentClaimMap(args.teamId, args.caseId);
  if (current) return;

  try {
    await publishClaimMapFromBrain({
      teamId: args.teamId,
      caseId: args.caseId,
      personId: args.personId,
      changeSummary: "Published from case brain (initial version)",
    });
  } catch {
    // No claims yet — leave version unset until content exists.
  }
}
