
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { judgeSystemPrompt } from "@/lib/cruxy/prompts/judge";
import { judgeSchema, type JudgeOutput } from "@/lib/cruxy/schemas/judge";
import {
  filterScoresByEvidence,
  logCitationFailures,
  type CitationSource,
} from "@/lib/cruxy/citations";

const FAILED_HEADLINE =
  "Cruxy could not finish judging this round. Human cards still count. Try End the round again when the connection is steady.";

function emptyFailedOutput(reason: string): JudgeOutput {
  return {
    scores: [],
    spirit: null,
    spirit_comment: null,
    overall_comment: reason,
    speaker_feedback: [],
    socratic_followups: [],
    headline: FAILED_HEADLINE,
    claims: [],
  };
}

/**
 * Fixture / sample-mode line ids (e.g. "line-1") often do not match real
 * transcript UUIDs, and fixture quotes may not appear in the stub transcript.
 * Remap onto real sources with a quote taken from that source so cite-or-quiet
 * keeps the scores; this is sample/fixture only (caller passes result.stub).
 */
function remapEvidenceToSources(
  scores: JudgeOutput["scores"],
  sources: CitationSource[],
): JudgeOutput["scores"] {
  if (sources.length === 0) return scores;
  const byId = new Map(sources.map((s) => [s.id, s]));
  const first = sources[0]!;
  return scores.map((s) => ({
    ...s,
    evidence: (s.evidence ?? []).map((e) => {
      const existing = byId.get(e.line_id);
      if (existing) {
        const quoteOk =
          !e.quote ||
          existing.text.toLowerCase().includes(e.quote.slice(0, 40).toLowerCase());
        return quoteOk
          ? e
          : { line_id: existing.id, quote: existing.text.slice(0, 80) };
      }
      const byQuote = sources.find(
        (src) =>
          e.quote &&
          src.text.toLowerCase().includes(e.quote.slice(0, 40).toLowerCase()),
      );
      const target = byQuote ?? first;
      return {
        line_id: target.id,
        quote: target.text.slice(0, 80),
      };
    }),
  }));
}

/**
 * Judge agent. On call failure or timeout, returns empty scores (never invented
 * numbers). Fixtures still produce real scored output in sample mode.
 */
export async function runJudgeAgent(input: {
  teamIds: string[];
  items: string[];
  transcriptBlock: string;
  lineSources: CitationSource[];
  personId?: string | null;
}): Promise<JudgeOutput & { stub: boolean; failed: boolean; failReason?: string }> {
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
    // No stubFallback of invented scores. Fail open with an empty card.
  });

  if (!result.ok) {
    return {
      ...emptyFailedOutput(result.reason),
      stub: true,
      failed: true,
      failReason: result.reason,
    };
  }

  const data = result.data;
  // Sample fixtures cite "line-1"; remap onto real transcript sources first.
  const remapped = result.stub
    ? remapEvidenceToSources(data.scores, input.lineSources)
    : data.scores;

  const { kept, dropped, failures } = filterScoresByEvidence(
    remapped,
    input.lineSources,
  );
  await logCitationFailures({
    feature: "judge_round",
    personId: input.personId,
    failures,
  });

  // Live call with no usable evidence after filtering is a soft failure.
  const failed =
    kept.length === 0 && input.lineSources.length > 0 && !result.stub;

  return {
    ...data,
    scores: kept,
    stub: result.stub,
    failed,
    failReason: failed
      ? "Cruxy returned scores without usable transcript evidence."
      : undefined,
    ...(dropped.length ? {} : {}),
  };
}
