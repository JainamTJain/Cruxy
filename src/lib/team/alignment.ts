import type { ClaimMapVersion } from "@/lib/team/types";

export function buildAlignmentQuestions(version: ClaimMapVersion): string[] {
  const c1 = version.body.claims[0]?.text;
  const c2 = version.body.claims[1]?.text;
  const qs = [
    c1 ? `What is our Claim 1 now?` : "What is our current lead claim?",
    c2 ? `What is our Claim 2 now?` : "Name one support under Claim 1.",
    "How do we answer the main counterclaim?",
  ];
  return qs.slice(0, 3);
}
