import type {
  ClaimMapNode,
  RobustnessScores,
  TruthItem,
} from "@/lib/case-brain/types";

export function computeRobustness(
  nodes: ClaimMapNode[],
  truthItems: TruthItem[],
): RobustnessScores {
  let supportsTotal = 0;
  let supportsBacked = 0;
  let counterclaimsTotal = 0;
  let counterclaimsAnswered = 0;

  for (const node of nodes) {
    for (const s of node.supports) {
      supportsTotal += 1;
      if (s.backings.length > 0) supportsBacked += 1;
    }
    for (const cc of node.counterclaims) {
      counterclaimsTotal += 1;
      if (cc.concede || cc.distinguish || cc.rebut) {
        counterclaimsAnswered += 1;
      }
    }
  }

  const accepted = truthItems.filter((t) => t.status === "accepted");
  const truthTotal = accepted.length;
  const truthVerified = accepted.filter(
    (t) => (t.citation_ids?.length ?? 0) > 0,
  ).length;
  const unverifiedOpen = Math.max(0, truthTotal - truthVerified);

  const ratios = [
    supportsTotal === 0 ? 0 : supportsBacked / supportsTotal,
    counterclaimsTotal === 0 ? 0 : counterclaimsAnswered / counterclaimsTotal,
    truthTotal === 0 ? 0 : truthVerified / truthTotal,
  ];
  const overall = Math.round(
    (ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100,
  );

  return {
    supports_backed: supportsBacked,
    supports_total: supportsTotal,
    counterclaims_answered: counterclaimsAnswered,
    counterclaims_total: counterclaimsTotal,
    truth_verified: truthVerified,
    truth_total: truthTotal,
    unverified_open: unverifiedOpen,
    overall,
  };
}

/** Structural readiness for the claim-map editor checklist. */
export function claimMapStructureOk(nodes: ClaimMapNode[]): {
  ok: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  if (nodes.length < 2) missing.push("Need at least 2 claims");
  for (const [i, node] of nodes.entries()) {
    if (node.supports.length < 3) {
      missing.push(`Claim ${i + 1} needs 3 supports`);
    }
    for (const [j, s] of node.supports.entries()) {
      if (s.backings.length < 1) {
        missing.push(`Claim ${i + 1} support ${j + 1} needs backing`);
      }
    }
    if (node.counterclaims.length < 1) {
      missing.push(`Claim ${i + 1} needs a counterclaim`);
    } else {
      for (const cc of node.counterclaims) {
        if (!cc.concede || !cc.distinguish || !cc.rebut) {
          missing.push(
            `Counterclaim on claim ${i + 1} needs concede, distinguish and rebut`,
          );
        }
      }
    }
  }
  return { ok: missing.length === 0, missing };
}
