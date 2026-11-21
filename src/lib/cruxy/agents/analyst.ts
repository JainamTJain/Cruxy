
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { analystSystemPrompt } from "@/lib/cruxy/prompts/analyst";
import {
  analystNoteSchema,
  analystOpposingSchema,
  changeTheFactsSchema,
  type AnalystNoteOutput,
} from "@/lib/cruxy/schemas/analyst";
import type { CitationSource } from "@/lib/cruxy/citations";
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

  return { problem: null, note: null };
}

export async function runAnalystNote(input: {
  text: string;
  kind: Proposal["kind"];
  citationIds: string[];
  teamTruth: TruthItem[];
  personId?: string | null;
  sources?: CitationSource[];
}): Promise<string | null> {
  const local = detectProposalProblems(input);
  if (!local.note) return null;

  const fallback = (): AnalystNoteOutput => ({
    problem: local.problem === null ? "none" : local.problem,
    note: local.note,
    claims: [],
  });

  const result = await runAgent({
    agent: "analyst",
    feature: "analyst_proposal",
    tier: "strong",
    system: analystSystemPrompt(),
    user: `Proposal kind=${input.kind}\nText: ${input.text}\nHeuristic note: ${local.note}\nCitation ids: ${input.citationIds.join(", ") || "none"}`,
    schema: analystNoteSchema,
    personId: input.personId,
    sources: input.sources,
    fixtureKey: "analyst_note",
    estimatedCostUsd: 0.001,
    stubFallback: fallback,
  });

  if (!result.ok) return local.note;
  if (result.stub) return local.note;
  if (!result.data.note || result.data.problem === "none") return local.note;
  return result.data.note.slice(0, 200);
}

export async function runAnalystOpposing(input: {
  caseTitle: string;
  caseNumber: number;
  personId?: string | null;
  sources?: CitationSource[];
}): Promise<
  Array<{
    title: string;
    strongest_support: string;
    weak_point: string;
    commentary_angles: [string, string];
  }>
> {
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
      citation_ids: [] as string[],
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
      citation_ids: [],
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
      citation_ids: [],
    },
  ];

  const result = await runAgent({
    agent: "analyst",
    feature: "analyst_opposing",
    tier: "strong",
    system: analystSystemPrompt(),
    user: `Draft 3 opposing positions for case ${input.caseNumber}: ${input.caseTitle}`,
    schema: analystOpposingSchema,
    personId: input.personId,
    sources: input.sources,
    fixtureKey: `analyst_opposing_${input.caseNumber}`,
    estimatedCostUsd: 0.002,
    stubFallback: () => ({ positions: stubs, claims: [] }),
  });

  if (!result.ok) return stubs;
  return result.data.positions.map((p) => ({
    title: p.title,
    strongest_support: p.strongest_support,
    weak_point: p.weak_point,
    commentary_angles: p.commentary_angles,
  }));
}

export async function runAnalystChangeTheFacts(input: {
  claimText: string;
  personId?: string | null;
  sources?: CitationSource[];
}): Promise<Array<{ fact: string; why_flips: string }>> {
  const stubs = [
    {
      fact: "The primary stakeholder consents with full information.",
      why_flips: "Removes the non-consent harm the claim relies on.",
      citation_ids: [] as string[],
    },
    {
      fact: "A less restrictive alternative becomes available.",
      why_flips: "Breaks the necessity link in the logic line.",
      citation_ids: [],
    },
  ];

  const result = await runAgent({
    agent: "analyst",
    feature: "analyst_change_facts",
    tier: "strong",
    system: analystSystemPrompt(),
    user: `Change-the-facts list for claim: ${input.claimText}`,
    schema: changeTheFactsSchema,
    personId: input.personId,
    sources: input.sources,
    fixtureKey: "analyst_change_facts",
    estimatedCostUsd: 0.001,
    stubFallback: () => ({ items: stubs, claims: [] }),
  });

  if (!result.ok) {
    return stubs.map(({ fact, why_flips }) => ({ fact, why_flips }));
  }
  return result.data.items.map(({ fact, why_flips }) => ({ fact, why_flips }));
}

export function socraticQuestionForInspiredBy(input: {
  proposalText: string;
  claimSummaries: string[];
}): string {
  const claimHint =
    input.claimSummaries[0]?.slice(0, 80) || "your strongest claim";
  return `Does this fit ${claimHint}, or does it pull against a principle you already use on another case?`;
}
