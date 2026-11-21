import {
  getCaseById,
  getCurrentClaimMap,
  listCaseRoles,
} from "@/lib/team/repository";
import { isSampleDataMode } from "@/lib/db/config";
import { CASE_ROLE_LABELS, type CaseRoleSlot } from "@/lib/team/types";

/** Plain read-aloud script from the current claim map (and one-pager when present). */
export async function buildReadAloudScript(input: {
  teamId: string;
  caseId: string;
}): Promise<{
  caseNumber: number | null;
  caseTitle: string | null;
  version: number | null;
  script: string;
  source: "one_pager" | "claim_map" | "empty";
  suggestedReaderRole: CaseRoleSlot;
}> {
  const caseRow = await getCaseById(input.caseId);
  const map = await getCurrentClaimMap(input.teamId, input.caseId);
  const roles = await listCaseRoles(input.teamId);
  const supporter = roles.find(
    (r) => r.case_id === input.caseId && r.role === "supporter",
  );

  let onePagerText: string | null = null;
  if (isSampleDataMode()) {
    const { readStore } = await import("@/lib/db/sample-store");
    const store = await readStore();
    const pages = store.one_pagers
      .filter(
        (p) => p.team_id === input.teamId && p.case_id === input.caseId,
      )
      .sort((a, b) => b.version - a.version);
    const page = pages[0];
    if (page) {
      const lines = page.body.claims.map(
        (c, i) =>
          `Claim ${i + 1}: ${c.text}. Logic: ${c.logic_line}. Supports: ${c.supports.join("; ") || "none"}.`,
      );
      if (page.body.counterclaim) {
        lines.push(
          `Counterclaim: ${page.body.counterclaim.text}. Concede: ${page.body.counterclaim.concede}. Distinguish: ${page.body.counterclaim.distinguish}. Rebut: ${page.body.counterclaim.rebut}.`,
        );
      }
      onePagerText = lines.join("\n");
    }
  }

  if (onePagerText) {
    return {
      caseNumber: caseRow?.number ?? null,
      caseTitle: caseRow?.title ?? null,
      version: map?.version ?? null,
      script: onePagerText,
      source: "one_pager",
      suggestedReaderRole: "supporter",
    };
  }

  if (map) {
    const lines = map.body.claims.map((c, i) => {
      const supports = c.supports.map((s) => s.text).join("; ") || "none yet";
      const counter = c.counterclaim_response?.trim()
        ? ` Counterclaim answer: ${c.counterclaim_response}`
        : " Counterclaim answer: not written yet.";
      return `Claim ${i + 1} (${c.key}): ${c.text}. Logic: ${c.logic_line}. Supports: ${supports}.${counter}`;
    });
    return {
      caseNumber: caseRow?.number ?? null,
      caseTitle: caseRow?.title ?? null,
      version: map.version,
      script: [
        `State of the case, about two minutes. ${CASE_ROLE_LABELS.supporter}${supporter ? " reads" : " reads (none set yet)"}.`,
        `Version v${map.version}. ${map.change_summary}`,
        ...lines,
      ].join("\n\n"),
      source: "claim_map",
      suggestedReaderRole: "supporter",
    };
  }

  return {
    caseNumber: caseRow?.number ?? null,
    caseTitle: caseRow?.title ?? null,
    version: null,
    script:
      "No current position yet for this case. Publish a claim map or one-pager first, then the supporter can read it aloud to open the session.",
    source: "empty",
    suggestedReaderRole: "supporter",
  };
}
