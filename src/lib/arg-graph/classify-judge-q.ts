/**
 * Classify judge questions from real rounds onto claim nodes they attack.
 * Small tier + citations. Writes an `attacks` edge via K's recordEdge().
 */
import "server-only";

import { callCruxy } from "@/lib/cruxy/callCruxy";
import { recordEdge } from "@/lib/graph";
import {
  listCruxyJudgeQa,
  type CruxyJudgeQaRow,
} from "@/lib/db/supabase/judge-card-extra";
import {
  upsertJudgeQClassification,
  type JudgeQClassificationRow,
} from "@/lib/db/supabase/arg-graph-extra";
import type { ClaimMapNode } from "@/lib/case-brain/types";

function clean(s: string): string {
  return s.replace(/·/g, ",").replace(/\u2014|\u2013/g, "-").trim();
}

export type ClassifyJudgeQInput = {
  roundId: string;
  teamId: string;
  caseId: string;
  nodes: ClaimMapNode[];
  personId?: string | null;
  questions?: CruxyJudgeQaRow[];
};

export type ClassifyJudgeQResult = {
  classified: JudgeQClassificationRow[];
  skipped: number;
};

/**
 * For each real judge Q in the round, pick the claim it attacks (small tier).
 * No citation, no edge.
 */
export async function classifyJudgeQuestionsForRound(
  input: ClassifyJudgeQInput,
): Promise<ClassifyJudgeQResult> {
  const claims = input.nodes
    .map((n, i) => ({
      id: n.claim.id,
      ord: i + 1,
      text: n.claim.text,
      logic: n.claim.logic_line ?? "",
      supports: n.supports.map((s) => s.support.text).filter(Boolean),
    }))
    .filter((c) => c.text && !c.text.includes("(edit me)"));

  if (!claims.length) {
    return { classified: [], skipped: 0 };
  }

  const questions =
    input.questions ?? (await listCruxyJudgeQa(input.roundId));
  if (!questions.length) {
    return { classified: [], skipped: 0 };
  }

  const corpus = claims.map((c) => ({
    id: c.id,
    text: [c.text, c.logic, ...c.supports].join("\n"),
    kind: "other" as const,
  }));

  const classified: JudgeQClassificationRow[] = [];
  let skipped = 0;

  for (const q of questions) {
    const questionText = clean(q.question);
    if (!questionText) {
      skipped += 1;
      continue;
    }

    const result = await callCruxy({
      feature: "judge_q_classify",
      tier: "small",
      personId: input.personId,
      estimatedCostUsd: 0.02,
      citationCorpus: corpus,
      messages: [
        {
          role: "system",
          content: [
            "You map an Ethics Bowl judge question to the claim it most clearly attacks.",
            "Return JSON only:",
            '{"claim_id":"<id or null>","rationale":"one short line","citation_ids":["<claim id>"],"claims":[{"text":"why this claim","citation_ids":["<claim id>"],"quote":"short quote from the claim text"}]}',
            "If none of the claims fit, claim_id must be null and citation_ids empty.",
            "Plain words. No middle dots. No em dashes.",
            "Claims:",
            ...claims.map(
              (c) =>
                `- id=${c.id} C${c.ord}: ${c.text}${c.logic ? ` (${c.logic})` : ""}`,
            ),
          ].join("\n"),
        },
        {
          role: "user",
          content: `Judge question: ${questionText}`,
        },
      ],
    });

    if (!result.ok || result.stub) {
      skipped += 1;
      continue;
    }

    let claimId: string | null = null;
    let rationale: string | null = null;
    let citationIds: string[] = [];

    try {
      const parsed = JSON.parse(result.text) as {
        claim_id?: string | null;
        rationale?: string;
        citation_ids?: string[];
      };
      const rawId = parsed.claim_id ? String(parsed.claim_id) : null;
      claimId =
        rawId && claims.some((c) => c.id === rawId) ? rawId : null;
      citationIds = (parsed.citation_ids ?? []).filter((id) =>
        claims.some((c) => c.id === id),
      );
      rationale = parsed.rationale ? clean(parsed.rationale) : null;
    } catch {
      skipped += 1;
      continue;
    }

    if (!claimId || !citationIds.includes(claimId)) {
      await upsertJudgeQClassification({
        round_id: input.roundId,
        question_source: "cruxy_judge_qa",
        question_id: q.id,
        question_text: questionText,
        claim_id: null,
        team_id: input.teamId,
        case_id: input.caseId,
        citation_ids: [],
        rationale: rationale ?? "No cited claim.",
        edge_id: null,
        created_by: input.personId ?? null,
      });
      skipped += 1;
      continue;
    }

    const edge = await recordEdge({
      from_kind: "question",
      from_id: q.id,
      to_kind: "claim",
      to_id: claimId,
      type: "attacks",
      weight: 0.65,
      source_kind: "cruxy_judge_qa",
      source_id: q.id,
      round_id: input.roundId,
      team_id: input.teamId,
      case_id: input.caseId,
      created_by: input.personId ?? null,
    });

    const row = await upsertJudgeQClassification({
      round_id: input.roundId,
      question_source: "cruxy_judge_qa",
      question_id: q.id,
      question_text: questionText,
      claim_id: claimId,
      team_id: input.teamId,
      case_id: input.caseId,
      citation_ids: citationIds,
      rationale,
      edge_id: edge.id,
      created_by: input.personId ?? null,
    });
    classified.push(row);
  }

  return { classified, skipped };
}
