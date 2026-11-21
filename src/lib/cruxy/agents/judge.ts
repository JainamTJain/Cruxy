
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { judgeSystemPrompt } from "@/lib/cruxy/prompts/judge";
import { judgeSchema, type JudgeOutput } from "@/lib/cruxy/schemas/judge";
import {
  filterScoresByEvidence,
  logCitationFailures,
  type CitationSource,
} from "@/lib/cruxy/citations";

export async function runJudgeAgent(input: {
  teamIds: string[];
  items: string[];
  transcriptBlock: string;
  lineSources: CitationSource[];
  personId?: string | null;
}): Promise<JudgeOutput & { stub: boolean }> {
  const firstLine = input.lineSources[0];
  const fallback = (): JudgeOutput => ({
    scores: input.items.map((item) => ({
      item,
      score: 7,
      comment: null,
      evidence: firstLine
        ? [
            {
              line_id: firstLine.id,
              quote: firstLine.text.slice(0, 80),
            },
          ]
        : [
            {
              line_id: "missing",
              quote: "no transcript",
            },
          ],
    })),
    spirit: 4,
    spirit_comment: "Respectful engagement throughout.",
    overall_comment:
      "Clear structure; strengthen the counterclaim answer with a concede-distinguish-rebut.",
    speaker_feedback: [],
    socratic_followups: [
      "What would the other side say is your weakest support?",
      "Which stakeholder did you leave out, and why does that matter?",
    ],
    headline:
      "Biggest fix: name the moral tension in the first 30 seconds, then support it.",
    claims: [],
  });

  const result = await runAgent({
    agent: "judge",
    feature: "judge_round",
    tier: "strong",
    system: judgeSystemPrompt(),
    user: `Score this round for teams ${input.teamIds.join(", ")}.\nItems: ${input.items.join(", ")}\nTranscript:\n${input.transcriptBlock}`,
    schema: judgeSchema,
    personId: input.personId,
    sources: input.lineSources,
    fixtureKey: "judge_round",
    estimatedCostUsd: 0.4,
    stubFallback: fallback,
  });

  const data = result.ok ? result.data : fallback();
  const { kept, dropped, failures } = filterScoresByEvidence(
    data.scores,
    input.lineSources,
  );
  await logCitationFailures({
    feature: "judge_round",
    personId: input.personId,
    failures,
  });

  return {
    ...data,
    scores: kept,
    stub: result.ok ? result.stub : true,
    // Dropped scores are intentionally omitted (no citation, no display).
    ...(dropped.length ? {} : {}),
  };
}
