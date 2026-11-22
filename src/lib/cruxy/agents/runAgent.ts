
import { z } from "zod";
import {
  callCruxy,
  type CallCruxyInput,
  type CallCruxyResult,
  type CruxyMessage,
} from "@/lib/cruxy/callCruxy";
import {
  applyCitationGuard,
  logCitationFailures,
  type CitationSource,
} from "@/lib/cruxy/citations";
import type { CitedClaim } from "@/lib/cruxy/schemas/common";
import type { ReasoningEffort } from "@/lib/cruxy/models";
import { loadFixtureText } from "@/lib/cruxy/agents/fixtures";

export type RunAgentInput<T extends z.ZodType> = {
  agent: string;
  feature: string;
  tier: "small" | "strong";
  system: string;
  user: string;
  schema: T;
  personId?: string | null;
  sources?: CitationSource[];
  /** Extra system / context messages after the fixed system prompt. */
  contextMessages?: CruxyMessage[];
  effort?: ReasoningEffort;
  estimatedCostUsd?: number;
  /** Fixture key for tests/cruxy recorded responses. */
  fixtureKey?: string;
  /** Enable Gateway web search tool path (Researcher). */
  webSearch?: boolean;
  stubFallback?: () => z.infer<T>;
};

export type RunAgentResult<T> =
  | {
      ok: true;
      data: T;
      raw: string;
      stub: boolean;
      model: string;
      costUsd: number;
      citationFailures: number;
    }
  | {
      ok: false;
      refused: true;
      reason: string;
      data: null;
    };

function extractJson(text: string): unknown | null {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1]!.trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Shared agent runner: callCruxy → JSON parse → zod → citation guard.
 */
export async function runAgent<T extends z.ZodType>(
  input: RunAgentInput<T>,
): Promise<RunAgentResult<z.infer<T>>> {
  const useFixtures =
    process.env.CRUXY_USE_FIXTURES === "1" ||
    !process.env.AI_GATEWAY_API_KEY?.trim();
  const fixture =
    useFixtures && input.fixtureKey
      ? loadFixtureText(input.fixtureKey)
      : null;

  let callResult: CallCruxyResult;

  if (fixture) {
    callResult = {
      ok: true,
      text: fixture,
      model: "fixture",
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      stub: true,
    };
  } else {
    const alreadyHasProfile = (input.contextMessages ?? []).some((m) =>
      m.content.includes("--- Learning profile ---"),
    );
    const profileMsgs =
      alreadyHasProfile || input.system.includes("--- Learning profile ---")
        ? []
        : await (
            await import("@/lib/cruxy/context")
          ).learningProfileSystemMessages(input.personId);
    const messages: CruxyMessage[] = [
      { role: "system", content: input.system },
      ...profileMsgs,
      ...(input.contextMessages ?? []),
      {
        role: "user",
        content: `${input.user}\n\nRespond with JSON only matching the schema.`,
      },
    ];

    const callInput: CallCruxyInput = {
      feature: input.feature,
      tier: input.tier,
      personId: input.personId ?? null,
      messages,
      effort: input.effort,
      estimatedCostUsd: input.estimatedCostUsd,
      citationCorpus: input.sources,
      webSearch: input.webSearch,
    };

    callResult = await callCruxy(callInput);
  }

  if (!callResult.ok) {
    return {
      ok: false,
      refused: true,
      reason: callResult.reason,
      data: null,
    };
  }

  let parsed = extractJson(callResult.text);
  if (parsed == null && (callResult.stub || input.stubFallback)) {
    const fallback = input.stubFallback?.();
    if (fallback != null) {
      parsed = fallback;
    }
  }

  if (parsed == null) {
    if (input.stubFallback) {
      parsed = input.stubFallback();
    } else {
      return {
        ok: false,
        refused: true,
        reason: "Cruxy returned a response I could not read as JSON.",
        data: null,
      };
    }
  }

  const zodResult = input.schema.safeParse(parsed);
  if (!zodResult.success) {
    if (input.stubFallback) {
      const fallback = input.stubFallback();
      return {
        ok: true,
        data: fallback,
        raw: callResult.text,
        stub: true,
        model: callResult.model,
        costUsd: callResult.costUsd,
        citationFailures: 0,
      };
    }
    return {
      ok: false,
      refused: true,
      reason: "Cruxy response did not match the expected shape.",
      data: null,
    };
  }

  let data = zodResult.data as z.infer<T> & { claims?: CitedClaim[] };
  let citationFailures = 0;

  if (input.sources?.length && Array.isArray(data.claims)) {
    const checked = applyCitationGuard(data, input.sources);
    data = checked.data;
    citationFailures = checked.failures.length;
    await logCitationFailures({
      feature: input.feature,
      personId: input.personId,
      failures: checked.failures,
    });
  }

  return {
    ok: true,
    data,
    raw: callResult.text,
    stub: callResult.stub,
    model: callResult.model,
    costUsd: callResult.costUsd,
    citationFailures,
  };
}
