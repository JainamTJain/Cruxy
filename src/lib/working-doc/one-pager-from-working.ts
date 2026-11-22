/**
 * Draw a one-pager body from the team's working document + accepted suggestions.
 */
import "server-only";

import { ensureTeamBrief } from "@/lib/case-brain/team-brief";
import {
  listAllSuggestions,
  listWorkingSections,
  WORKING_SECTION_LABELS,
  type WorkingSectionKey,
} from "@/lib/db/supabase/working-doc-extra";
import {
  insertOnePagerSyncProposal,
  getPendingOnePagerSync,
  decideOnePagerSync,
} from "@/lib/db/supabase/one-pager-sync-extra";
import { withEmptyRows } from "@/lib/revision/one-pager-edit";
import type { OnePagerBody } from "@/lib/revision/types";
import {
  latestOnePager,
  saveOnePagerEdit,
  draftOnePager,
} from "@/lib/revision/repository";
import { logActivity } from "@/lib/db/repository";

function sectionBody(
  sections: { section_key: WorkingSectionKey; body: string }[],
  key: WorkingSectionKey,
): string {
  return sections.find((s) => s.section_key === key)?.body.trim() ?? "";
}

function splitClaims(claimsText: string): string[] {
  const lines = claimsText
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean);
  if (lines.length >= 2) return lines.slice(0, 2);
  if (claimsText.trim()) {
    const parts = claimsText.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) return parts.slice(0, 2);
    return [claimsText.trim(), ""];
  }
  return ["", ""];
}

function splitSupports(supportText: string): string[] {
  const lines = supportText
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean);
  const out = lines.slice(0, 3);
  while (out.length < 3) out.push("");
  return out;
}

export function bodyFromWorkingSections(opts: {
  sections: { section_key: WorkingSectionKey; body: string }[];
  acceptedTexts: string[];
  thesisFallback?: string | null;
}): OnePagerBody {
  const answer = sectionBody(opts.sections, "answer_one_sentence");
  const claimsRaw = sectionBody(opts.sections, "claims");
  const supportRaw = sectionBody(opts.sections, "support");
  const objection = sectionBody(opts.sections, "objection_reply");
  const values = sectionBody(opts.sections, "values_in_tension");
  const judges = sectionBody(opts.sections, "judges_questions");

  const claimTexts = splitClaims(claimsRaw);
  const supports = splitSupports(supportRaw);

  const claims = [
    {
      text: claimTexts[0] || answer || "",
      logic_line: claimTexts[0] ? "" : "",
      supports: [supports[0] ?? "", supports[1] ?? "", supports[2] ?? ""],
    },
    {
      text: claimTexts[1] || "",
      logic_line: "",
      supports: ["", "", ""],
    },
  ];

  // Fold accepted suggestions into supports gaps.
  let si = 0;
  for (const t of opts.acceptedTexts) {
    while (si < 3 && claims[0]!.supports[si]) si++;
    if (si >= 3) break;
    claims[0]!.supports[si] = t.slice(0, 280);
    si++;
  }

  const [left, right] = values.includes(" versus ")
    ? values.split(/\s+versus\s+/i)
    : values.includes(" vs ")
      ? values.split(/\s+vs\.?\s+/i)
      : ["", values];

  const questions = judges
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((q) => ({ q, hint: "" }));

  const body: OnePagerBody = {
    claims,
    counterclaim: {
      text: objection.split(/\n/)[0]?.trim() ?? "",
      concede: "",
      distinguish: "",
      rebut: objection.includes("\n")
        ? objection.split(/\n/).slice(1).join(" ").trim()
        : "",
    },
    language: {
      plain: (answer || claimTexts[0] || "").slice(0, 120),
      analogies: [],
      vivid: "",
      avoid: [],
    },
    empty_rows: [],
    visuals: [
      {
        kind: "claim_map",
        title: "Claim map",
        payload: {
          nodes: claims.map((c, i) => ({
            id: `c${i + 1}`,
            label: c.text || `Claim ${i + 1}`,
            supports: c.supports.filter(Boolean),
          })),
          counter: objection.slice(0, 200) || null,
        },
      },
      {
        kind: "values_scale",
        title: "Values in tension",
        payload: {
          left: (left || "Value A").slice(0, 80),
          right: (right || "Value B").slice(0, 80),
          note: values.slice(0, 200),
        },
      },
      {
        kind: "question_table",
        title: "Likely questions",
        payload: { rows: questions },
      },
      {
        kind: "stakeholder_grid",
        title: "Stakeholders",
        payload: {
          cells: ["Primary actors", "Affected", "Voiceless", "Institutions"],
        },
      },
      {
        kind: "fact_timeline",
        title: "Case facts",
        payload: { events: [] },
      },
      {
        kind: "framework_strip",
        title: "Frameworks",
        payload: { items: [] },
      },
    ],
  };

  const thesis = answer || opts.thesisFallback || "";
  if (thesis && body.language) {
    body.language.plain = thesis.slice(0, 120);
  }

  return withEmptyRows(body);
}

export async function proposeOnePagerFromWorkingDoc(opts: {
  caseId: string;
  teamId: string;
  personId: string;
}): Promise<{ proposed: boolean; summary: string }> {
  const brief = await ensureTeamBrief(opts);
  const sections = await listWorkingSections(brief.id);
  const filled = sections.filter((s) => s.body.trim()).length;
  if (filled === 0) {
    return { proposed: false, summary: "Working document is empty." };
  }

  const all = await listAllSuggestions({
    teamId: opts.teamId,
    caseId: opts.caseId,
  });
  const accepted = all
    .filter((s) => s.status === "ticked")
    .map((s) => s.text);

  const body = bodyFromWorkingSections({
    sections,
    acceptedTexts: accepted,
    thesisFallback: brief.thesis,
  });

  const current = await latestOnePager(opts.teamId, opts.caseId);
  const summaryParts = [
    `${filled} working section${filled === 1 ? "" : "s"}`,
    accepted.length
      ? `${accepted.length} accepted suggestion${accepted.length === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);

  await insertOnePagerSyncProposal({
    teamId: opts.teamId,
    caseId: opts.caseId,
    body,
    changeSummary: `Update from working document (${summaryParts.join(", ")}).`,
    personId: opts.personId,
  });

  await logActivity({
    person_id: opts.personId,
    action: "one_pager_sync_proposed",
    target: opts.caseId,
    meta: { teamId: opts.teamId, sections: filled },
  });

  return {
    proposed: true,
    summary: `Proposed one pager update from ${WORKING_SECTION_LABELS.answer_one_sentence.toLowerCase()} and filled sections.`,
  };
}

export async function acceptOnePagerSyncProposal(opts: {
  proposalId: string;
  personId: string;
  teamId: string;
  caseId: string;
}) {
  const pending = await getPendingOnePagerSync({
    teamId: opts.teamId,
    caseId: opts.caseId,
  });
  if (!pending || pending.id !== opts.proposalId) {
    throw new Error("No matching pending one pager update.");
  }

  let page = await latestOnePager(opts.teamId, opts.caseId);
  if (!page) {
    page = await draftOnePager({
      teamId: opts.teamId,
      caseId: opts.caseId,
      personId: opts.personId,
    });
  }

  const saved = await saveOnePagerEdit({
    onePagerId: page.id,
    body: withEmptyRows(pending.proposed_body),
    changeNote: pending.change_summary || "Accepted from working document",
    personId: opts.personId,
  });

  await decideOnePagerSync({
    id: pending.id,
    status: "accepted",
    personId: opts.personId,
  });

  await logActivity({
    person_id: opts.personId,
    action: "one_pager_sync_accepted",
    target: saved.id,
    meta: { proposalId: pending.id },
  });

  return saved;
}

export async function dismissOnePagerSyncProposal(opts: {
  proposalId: string;
  personId: string;
  teamId: string;
  caseId: string;
}) {
  const pending = await getPendingOnePagerSync({
    teamId: opts.teamId,
    caseId: opts.caseId,
  });
  if (!pending || pending.id !== opts.proposalId) {
    throw new Error("No matching pending one pager update.");
  }
  return decideOnePagerSync({
    id: pending.id,
    status: "dismissed",
    personId: opts.personId,
  });
}
