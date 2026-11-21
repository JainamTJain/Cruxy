/**
 * Deterministic gap check across all three teams' claim maps (F-093 / F-094).
 */
import type { CaseBrainSnapshot } from "@/lib/case-brain/types";
import type { ResearchGap } from "@/lib/library/types";

export function gapsFromClaimMaps(input: {
  caseNumber: number;
  brains: CaseBrainSnapshot[];
  hasLibraryFiles: boolean;
  unansweredModeratorQuestions?: string[];
}): ResearchGap[] {
  const gaps: ResearchGap[] = [];
  const { caseNumber, brains, hasLibraryFiles } = input;

  if (!hasLibraryFiles) {
    gaps.push({
      kind: "unverified_fact",
      claim_ref: `Case ${caseNumber}`,
      detail: "No digested library files tagged to this case yet.",
    });
  }

  for (const brain of brains) {
    for (const [ci, node] of brain.claims.entries()) {
      for (const [si, row] of node.supports.entries()) {
        if (!row.backings.length) {
          gaps.push({
            kind: "unsupported_support",
            claim_ref: `Case ${caseNumber}, Claim ${ci + 1}, Support ${si + 1}`,
            detail: `Support has no backing: "${row.support.text.slice(0, 120)}"`,
          });
        } else {
          const thin = row.backings.every(
            (b) => !b.citation_ids || b.citation_ids.length === 0,
          );
          if (thin) {
            gaps.push({
              kind: "unverified_fact",
              claim_ref: `Case ${caseNumber}, Claim ${ci + 1}, Support ${si + 1}`,
              detail: "Backing exists but has no citation ids yet.",
            });
          }
        }
      }

      if (node.counterclaims.length === 0) {
        gaps.push({
          kind: "unanswered_counter",
          claim_ref: `Case ${caseNumber}, Claim ${ci + 1}`,
          detail: "No counterclaim row yet.",
        });
      } else {
        for (const cc of node.counterclaims) {
          if (!cc.concede || !cc.distinguish || !cc.rebut) {
            gaps.push({
              kind: "unanswered_counter",
              claim_ref: `Case ${caseNumber}, Claim ${ci + 1}`,
              detail: `Counterclaim missing concede/distinguish/rebut: "${cc.text.slice(0, 100)}"`,
            });
          }
        }
      }
    }
  }

  for (const q of input.unansweredModeratorQuestions ?? []) {
    gaps.push({
      kind: "unanswered_moderator",
      claim_ref: `Case ${caseNumber}`,
      detail: q.slice(0, 200),
    });
  }

  // Cap so the nightly loop stays cheap.
  return gaps.slice(0, 12);
}

/** Map research findings onto claim/support/counterclaim coverage cells. */
export function coverageFromFindings(input: {
  claimCount: number;
  findings: Array<{
    claim_ref: string;
    verified: boolean;
    needs_check: boolean;
  }>;
}): Array<{
  label: string;
  cells: Array<"full" | "half" | "gap" | "empty">;
}> {
  const n = Math.max(input.claimCount, 1);
  const rows: Array<{
    label: string;
    cells: Array<"full" | "half" | "gap" | "empty">;
  }> = [];

  for (let i = 0; i < Math.min(n, 2); i++) {
    const cells: Array<"full" | "half" | "gap" | "empty"> = [];
    for (let s = 1; s <= 3; s++) {
      const matches = input.findings.filter((f) => {
        const ref = f.claim_ref.toLowerCase();
        return (
          ref.includes(`claim ${i + 1}`) &&
          (ref.includes(`support ${s}`) || ref.includes(`s${s}`))
        );
      });
      cells.push(cellFromMatches(matches));
    }
    const vs = input.findings.filter((f) => {
      const ref = f.claim_ref.toLowerCase();
      return (
        ref.includes(`claim ${i + 1}`) &&
        (ref.includes("counter") || ref.includes("vs"))
      );
    });
    cells.push(cellFromMatches(vs.length ? vs : input.findings.filter((f) =>
      f.claim_ref.toLowerCase().includes(`claim ${i + 1}`),
    )));
    rows.push({ label: `C${i + 1}`, cells });
  }
  return rows;
}

function cellFromMatches(
  matches: Array<{ verified: boolean; needs_check: boolean }>,
): "full" | "half" | "gap" | "empty" {
  if (!matches.length) return "gap";
  const verified = matches.filter((m) => m.verified && !m.needs_check).length;
  if (verified >= 2) return "full";
  if (verified === 1 || matches.some((m) => m.verified || m.needs_check))
    return "half";
  return "gap";
}
