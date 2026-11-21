import "server-only";
import { z } from "zod";
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { moderatorSystemPrompt } from "@/lib/cruxy/prompts/moderator";
import { citedClaimSchema } from "@/lib/cruxy/schemas/common";
import { splitPasteIntoQuestions } from "@/lib/revision/moderator-bank";
import type { QuestionType } from "@/lib/revision/types";

const pasteSplitSchema = z.object({
  questions: z.array(
    z.object({
      text: z.string(),
      type: z.enum([
        "follow_up",
        "pushback",
        "other_team",
        "change_facts",
        "state_view",
        "closing",
      ]),
      difficulty: z.number().int().min(1).max(3),
      case_number: z.number().int().min(1).max(99).optional().nullable(),
    }),
  ),
  claims: z.array(citedClaimSchema).default([]),
});

export type PasteSplitPart = {
  text: string;
  type: QuestionType;
  difficulty: 1 | 2 | 3;
  case_number?: number | null;
};

export async function splitPasteWithCruxy(input: {
  raw: string;
  personId: string;
  caseCatalog: { id: string; number: number; title: string }[];
  defaultCaseId: string | null;
}): Promise<PasteSplitPart[]> {
  const heuristic = splitPasteIntoQuestions(input.raw);

  const caseLines = input.caseCatalog
    .map((c) => `${c.number}: ${c.title} (id ${c.id})`)
    .join("\n");

  const fallback = (): z.infer<typeof pasteSplitSchema> => ({
    questions: heuristic.map((h) => ({
      text: h.text,
      type: h.type,
      difficulty: h.difficulty,
      case_number: null,
    })),
    claims: [],
  });

  const result = await runAgent({
    agent: "moderator",
    feature: "moderator_paste_split",
    tier: "small",
    system: `${moderatorSystemPrompt()}\n\nSplit unstructured pasted text into single moderator questions. Tag each with type and difficulty 1-3. If a question clearly belongs to one regional case, set case_number from the catalog. Return JSON only.`,
    user: `Regional cases:\n${caseLines}\n\nPasted text:\n${input.raw.slice(0, 4000)}`,
    schema: pasteSplitSchema,
    personId: input.personId,
    fixtureKey: "moderator_paste_split",
    estimatedCostUsd: 0.01,
    stubFallback: fallback,
  });

  const data = result.ok ? result.data : fallback();
  const byNumber = new Map(input.caseCatalog.map((c) => [c.number, c.id]));

  const parts: PasteSplitPart[] = [];
  for (const q of data.questions) {
    const text = q.text?.trim();
    if (!text || text.length < 8) continue;
    let t = text;
    if (!t.endsWith("?") && /^(what|why|how|who|when|where|is|are|do|does|should|would|can|could)\b/i.test(t)) {
      t = `${t}?`;
    }
    parts.push({
      text: t,
      type: q.type,
      difficulty: Math.min(3, Math.max(1, q.difficulty)) as 1 | 2 | 3,
      case_number: q.case_number ?? undefined,
    });
  }

  if (parts.length === 0) return heuristic;

  return parts.map((p) => {
    if (!p.case_number) return p;
    const id = byNumber.get(p.case_number);
    if (!id || !input.defaultCaseId) return p;
    return p;
  });
}

export function caseIdForPastePart(
  part: PasteSplitPart,
  caseCatalog: { id: string; number: number }[],
  fallbackCaseId: string,
): string {
  if (part.case_number) {
    const hit = caseCatalog.find((c) => c.number === part.case_number);
    if (hit) return hit.id;
  }
  return fallbackCaseId;
}