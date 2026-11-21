import "server-only";
import { z } from "zod";
import { runCoachSocratic } from "@/lib/cruxy/agents/coach";
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { coachSocraticSystemPrompt } from "@/lib/cruxy/prompts/coach";
import { citedClaimSchema } from "@/lib/cruxy/schemas/common";
import type { ClaimRow } from "@/lib/revision/types";
import type { SocraticSession } from "@/lib/revision/types";

const socraticSummarySchema = z.object({
  held: z.string(),
  weak: z.string(),
  next: z.string(),
  claims: z.array(citedClaimSchema).default([]),
});

export function pickWeakestClaim(claims: ClaimRow[]): ClaimRow | null {
  if (!claims.length) return null;
  return claims.find((c) => !c.logic_line?.trim()) ?? claims[0] ?? null;
}

export function buildClaimMapSummary(claims: ClaimRow[]): string {
  if (!claims.length) return "No claims on the map yet.";
  return claims
    .map((c, i) => {
      const flag = c.logic_line?.trim() ? "linked" : "weak link";
      return `Claim ${i + 1} (${flag}): ${c.text}`;
    })
    .join("\n");
}

export async function cruxySocraticOpening(input: {
  claims: ClaimRow[];
  personId: string;
}): Promise<{ question: string; claimLinks: string[] }> {
  const weakest = pickWeakestClaim(input.claims);
  const summary = buildClaimMapSummary(input.claims);
  const extra = weakest
    ? `\nWeakest link claim id: ${weakest.id}\nText: ${weakest.text}`
    : "";

  const out = await runCoachSocratic({
    claimMapSummary: `${summary}${extra}`,
    priorAnswer: null,
    personId: input.personId,
  });

  const question =
    out.question?.trim() ||
    (weakest
      ? `Why does "${weakest.text.slice(0, 80)}" follow from your supports?`
      : "What is the weakest link between your claim and your supports?");

  return {
    question,
    claimLinks: input.claims.map((c) => c.id),
  };
}

export async function cruxySocraticAfterAnswer(input: {
  claims: ClaimRow[];
  turns: SocraticSession["turns"];
  personId: string;
}): Promise<
  | { status: "active"; question: string }
  | { status: "done"; summary: string }
> {
  const cruxyCount = input.turns.filter((t) => t.role === "cruxy").length;
  const lastAnswer = [...input.turns].reverse().find((t) => t.role === "person")?.text;

  if (cruxyCount >= 3) {
    const transcript = input.turns
      .map((t) => `${t.role === "cruxy" ? "Cruxy" : "Member"}: ${t.text}`)
      .join("\n");
    const summary = await cruxySocraticSummary({
      claimMapSummary: buildClaimMapSummary(input.claims),
      transcript,
      personId: input.personId,
    });
    return { status: "done", summary };
  }

  const out = await runCoachSocratic({
    claimMapSummary: buildClaimMapSummary(input.claims),
    priorAnswer: lastAnswer ?? null,
    personId: input.personId,
  });

  let question = out.question?.trim();
  if (!question) {
    const fallbacks = [
      "Why does that follow?",
      "What would your opponent say to that?",
      "Which Truth Source backs the key fact you just used?",
    ];
    question = fallbacks[Math.min(cruxyCount, fallbacks.length - 1)]!;
  }

  return { status: "active", question };
}

export async function cruxySocraticSummary(input: {
  claimMapSummary: string;
  transcript: string;
  personId: string;
}): Promise<string> {
  const fallback = (): z.infer<typeof socraticSummarySchema> => ({
    held: "You named a support and tried to connect it to the claim.",
    weak: "The opponent angle still needs a concede, distinguish, or rebut line.",
    next: "Tie the answer to a cited Truth Source on the claim map.",
    claims: [],
  });

  const result = await runAgent({
    agent: "coach",
    feature: "socratic_drill_summary",
    tier: "small",
    system: `${coachSocraticSystemPrompt()}\n\nReturn exactly three short lines as JSON: held (what held), weak (what did not), next (one next step). No lists.`,
    user: `Claim map:\n${input.claimMapSummary}\n\nDrill transcript:\n${input.transcript}`,
    schema: socraticSummarySchema,
    personId: input.personId,
    fixtureKey: "coach_socratic_summary",
    estimatedCostUsd: 0.01,
    stubFallback: fallback,
  });

  const data = result.ok ? result.data : fallback();
  return [`Held: ${data.held}`, `Weak: ${data.weak}`, `Next: ${data.next}`].join(
    "\n",
  );
}