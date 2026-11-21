/**
 * Analyst agent helpers for Case brain.
 * Uses callCruxy when available; otherwise deterministic stub notes.
 * Cite-or-quiet: notes only when there is a problem.
 */
import { callCruxy } from "@/lib/cruxy/callCruxy";
import type { Proposal, TruthItem } from "@/lib/case-brain/types";

export type AnalystProblem =
  | "unverified"
  | "contradicts_truth"
  | "weak_support"
  | "empty"
  | null;

export function detectProposalProblems(input: {
  text: string;
  kind: Proposal["kind"];
  citationIds: string[];
  teamTruth: TruthItem[];
}): { problem: AnalystProblem; note: string | null } {
  const text = input.text.trim();
  if (!text) {
    return { problem: "empty", note: "Empty proposal — nothing to decide." };
  }

  if (
    (input.kind === "fact" || input.kind === "quote") &&
    input.citationIds.length === 0
  ) {
    return {
      problem: "unverified",
      note: "Unverified: no passage, page or timestamp linked yet.",
    };
  }

  const lower = text.toLowerCase();
  for (const t of input.teamTruth) {
    if (t.status !== "accepted") continue;
    // Very light contradiction heuristic for sample path
    if (
      t.text.length > 20 &&
      (lower.includes("not " + t.text.slice(0, 24).toLowerCase()) ||
        (t.kind === "fact" &&
          lower.includes("false") &&
          lower.includes(t.text.slice(0, 16).toLowerCase())))
    ) {
      return {
        problem: "contradicts_truth",
        note: `Contradicts an accepted Truth Source: "${t.text.slice(0, 80)}${t.text.length > 80 ? "…" : ""}"`,
      };
    }
  }

  if (text.split(/\s+/).length < 4 && input.kind !== "framework") {
    return {
      problem: "weak_support",
      note: "Weak support: too short to carry a claim on its own.",
    };
  }

  // No problem → no note (acceptable / relevant / sufficient passed)
  return { problem: null, note: null };
}

export async function analystNoteForProposal(input: {
  text: string;
  kind: Proposal["kind"];
  citationIds: string[];
  teamTruth: TruthItem[];
  personId?: string | null;
}): Promise<string | null> {
  const local = detectProposalProblems(input);
  if (!local.note) return null;

  // Optionally enrich via gateway; stub path keeps deterministic note
  const result = await callCruxy({
    feature: "analyst_proposal",
    tier: "strong",
    personId: input.personId ?? null,
    messages: [
      {
        role: "system",
        content:
          "You are Cruxy's Analyst. Return one short problem note only if the proposal fails acceptable/relevant/sufficient, is unverified, contradicts a Truth Source, or is weak. Otherwise return exactly NONE.",
      },
      {
        role: "user",
        content: `Proposal: ${input.text}\nHeuristic note: ${local.note}`,
      },
    ],
    estimatedCostUsd: 0.001,
  });

  if (!result.ok) return local.note;
  const text = result.text.trim();
  if (!text || text.toUpperCase() === "NONE") return local.note;
  // Prefer short local note for consistency in sample mode / stubs
  if (result.stub) return local.note;
  return text.slice(0, 200);
}

export function socraticQuestionForInspiredBy(input: {
  proposalText: string;
  claimSummaries: string[];
}): string {
  const claimHint =
    input.claimSummaries[0]?.slice(0, 80) || "your strongest claim";
  return `Does this fit ${claimHint}, or does it pull against a principle you already use on another case?`;
}

export async function draftOpposingPositions(input: {
  caseTitle: string;
  caseNumber: number;
  personId?: string | null;
}): Promise<
  Array<{
    title: string;
    strongest_support: string;
    weak_point: string;
    commentary_angles: [string, string];
  }>
> {
  // Deterministic sample opposing bank; real Cruxy draft when gateway is live
  const stubs = [
    {
      title: `Restrictive reading of Case ${input.caseNumber}`,
      strongest_support:
        "Emphasizes harm prevention and institutional duty over individual choice.",
      weak_point: "Underspecifies who bears the cost of the restriction.",
      commentary_angles: [
        "Press whether the duty is moral or merely prudential.",
        "Ask what they concede when the harmed party consents.",
      ] as [string, string],
    },
    {
      title: `Autonomy-first reply on ${input.caseTitle}`,
      strongest_support:
        "Centers informed consent and least-restrictive means.",
      weak_point: "May underweight cumulative or systemic effects.",
      commentary_angles: [
        "Ask how they handle irreversible harms.",
        "Probe whether 'least restrictive' still works across Cases 12–13.",
      ] as [string, string],
    },
    {
      title: "Procedural fairness frame",
      strongest_support:
        "Argues the process of deciding matters as much as the outcome.",
      weak_point: "Can stall without a clear decision rule.",
      commentary_angles: [
        "Ask what fairness requires when time is short.",
        "Check consistency with their stakeholder list.",
      ] as [string, string],
    },
  ];

  await callCruxy({
    feature: "analyst_opposing",
    tier: "strong",
    personId: input.personId ?? null,
    messages: [
      {
        role: "user",
        content: `Draft opposing positions for case ${input.caseNumber}: ${input.caseTitle}`,
      },
    ],
    estimatedCostUsd: 0.002,
  });

  return stubs;
}

export async function draftChangeTheFacts(input: {
  claimText: string;
  personId?: string | null;
}): Promise<Array<{ fact: string; why_flips: string }>> {
  await callCruxy({
    feature: "analyst_change_facts",
    tier: "strong",
    personId: input.personId ?? null,
    messages: [
      {
        role: "user",
        content: `Change-the-facts list for claim: ${input.claimText}`,
      },
    ],
    estimatedCostUsd: 0.001,
  });

  return [
    {
      fact: "The primary stakeholder consents with full information.",
      why_flips: "Removes the non-consent harm the claim relies on.",
    },
    {
      fact: "A less restrictive alternative becomes available.",
      why_flips: "Breaks the necessity link in the logic line.",
    },
  ];
}
