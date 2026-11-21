import { generateText, embed, gateway, stepCountIs } from "ai";
import {
  CAP_ALERT_RATIO,
  MONTHLY_CAP_USD_DEFAULT,
  PER_PERSON_ASSISTANT_DAY_CAP_USD,
  PER_RESEARCH_NIGHT_CAP_USD,
  PER_ROUND_CAP_USD,
} from "@/lib/constants";
import {
  getSpendCaps,
  insertAiCall,
  logActivity,
  sumMonthlySpendUsd,
} from "@/lib/db/repository";
import {
  getModelSetting,
  normalizeTierName,
  resolveEffort,
  type ModelTier,
  type ReasoningEffort,
} from "@/lib/cruxy/models";
import {
  applyCitationGuard,
  logCitationFailures,
  tryParseClaimsPayload,
  type CitationSource,
} from "@/lib/cruxy/citations";

export type CruxyMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CallCruxyInput = {
  feature: string;
  /** Model tier. Prefer this over legacy `model` names. */
  tier?: "small" | "strong";
  /**
   * @deprecated Use `tier`. Accepted only to normalize old call-site / API names
   * (`small`, `analyst-small`, `cruxy-default`, `cruxy-admin`, `strong`).
   */
  model?: string;
  messages: CruxyMessage[];
  personId?: string | null;
  /** Estimated cost before calling; used for cap checks. */
  estimatedCostUsd?: number;
  /** Reasoning effort override for this call. */
  effort?: ReasoningEffort;
  /**
   * When set, run the citation guard on any JSON `claims` in the response
   * (no citation, no display). Workstream H.
   */
  citationCorpus?: CitationSource[];
  /**
   * Ask the Gateway for web search tooling (Researcher nightly).
   * Still goes through this function only; no provider SDKs.
   */
  webSearch?: boolean;
};

export type CallCruxyResult =
  | {
      ok: true;
      text: string;
      model: string;
      tokensIn: number;
      tokensOut: number;
      costUsd: number;
      stub: boolean;
      zeroDataRetention?: boolean;
    }
  | {
      ok: false;
      refused: true;
      reason: string;
      monthlySpend: number;
      monthlyCap: number;
    };

async function monthlyCap(): Promise<number> {
  try {
    const caps = await getSpendCaps();
    if (caps?.monthly_usd && Number.isFinite(caps.monthly_usd)) {
      return caps.monthly_usd;
    }
  } catch {
    /* fall through */
  }
  const n = Number(process.env.MONTHLY_CAP_USD ?? MONTHLY_CAP_USD_DEFAULT);
  return Number.isFinite(n) ? n : MONTHLY_CAP_USD_DEFAULT;
}

function hasAiKey(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY?.trim());
}

function estimateTokens(messages: CruxyMessage[]) {
  const chars = messages.reduce((n, m) => n + m.content.length, 0);
  return Math.max(1, Math.ceil(chars / 4));
}

/** Rough USD estimate for stub / pre-check (Flash-lite-ish). */
function estimateCost(tokensIn: number, tokensOut: number) {
  return tokensIn * 0.00000025 + tokensOut * 0.000001 || 0.0001;
}

function featureCap(
  feature: string,
  caps: Awaited<ReturnType<typeof getSpendCaps>> | null,
): number | null {
  const f = feature.toLowerCase();
  if (f.includes("round") || f.includes("judge") || f.includes("report")) {
    return caps?.per_round_usd ?? PER_ROUND_CAP_USD;
  }
  if (f.includes("research")) {
    return caps?.per_research_night_usd ?? PER_RESEARCH_NIGHT_CAP_USD;
  }
  if (f.includes("assistant") || f.includes("drawer")) {
    return caps?.per_person_assistant_day_usd ?? PER_PERSON_ASSISTANT_DAY_CAP_USD;
  }
  return null;
}

function resolveTier(input: CallCruxyInput): "small" | "strong" {
  if (input.tier === "small" || input.tier === "strong") return input.tier;
  const normalized = normalizeTierName(input.model);
  return normalized === "embed" ? "small" : normalized;
}

function gatewayCost(
  providerMetadata: Record<string, unknown> | undefined,
): number | null {
  const gateway = providerMetadata?.gateway;
  if (!gateway || typeof gateway !== "object") return null;
  const cost = (gateway as { cost?: unknown }).cost;
  if (typeof cost === "number" && Number.isFinite(cost)) return cost;
  if (typeof cost === "string" && Number.isFinite(Number(cost))) {
    return Number(cost);
  }
  return null;
}

function gatewayZdr(
  providerMetadata: Record<string, unknown> | undefined,
): boolean {
  const gateway = providerMetadata?.gateway;
  if (!gateway || typeof gateway !== "object") return false;
  return Boolean(
    (gateway as { enabledZeroDataRetention?: unknown }).enabledZeroDataRetention,
  );
}

function answeredModel(
  responseModelId: string | undefined,
  providerMetadata: Record<string, unknown> | undefined,
  primary: string,
): string {
  if (responseModelId?.trim()) return responseModelId;
  const gateway = providerMetadata?.gateway;
  if (gateway && typeof gateway === "object") {
    const routing = (gateway as { routing?: { modelAttempts?: unknown } })
      .routing;
    const attempts = routing?.modelAttempts;
    if (Array.isArray(attempts)) {
      for (let i = attempts.length - 1; i >= 0; i--) {
        const a = attempts[i] as {
          success?: boolean;
          canonicalSlug?: string;
        };
        if (a?.success && typeof a.canonicalSlug === "string") {
          return a.canonicalSlug;
        }
      }
    }
  }
  return primary;
}

/**
 * Workstream H citation hook: if the response is JSON with `claims`, drop
 * any claim that fails id / quote checks (no citation, no display).
 */
async function applyOptionalCitationGuard(
  text: string,
  corpus: CitationSource[] | undefined,
  feature: string,
  personId?: string | null,
): Promise<string> {
  if (!corpus?.length) return text;
  const payload = tryParseClaimsPayload(text);
  if (!payload) return text;
  const checked = applyCitationGuard(payload, corpus);
  await logCitationFailures({
    feature,
    personId,
    failures: checked.failures,
  });
  if (checked.failures.length === 0) return text;
  // Rewrite claims array in the JSON payload; leave the rest untouched when possible.
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return text;
    const obj = JSON.parse(text.slice(start, end + 1)) as Record<
      string,
      unknown
    >;
    obj.claims = checked.data.claims;
    return JSON.stringify(obj);
  } catch {
    return text;
  }
}

/**
 * Single AI gateway. Logs every call to ai_calls.
 * Refuses when monthly cap is reached (reading / flashcard review exempt).
 * Stubs a response when AI_GATEWAY_API_KEY is missing.
 * Live path: Vercel AI SDK + AI Gateway with per-request ZDR and settings fallbacks.
 */
export async function callCruxy(
  input: CallCruxyInput,
): Promise<CallCruxyResult> {
  const tier = resolveTier(input);
  const caps = await getSpendCaps().catch(() => null);
  const cap = await monthlyCap();
  const spent = await sumMonthlySpendUsd();
  const estimated =
    input.estimatedCostUsd ??
    estimateCost(estimateTokens(input.messages), 200);

  const setting = await getModelSetting(tier);
  const modelLabel = setting.model;

  const exempt =
    input.feature === "reading" ||
    input.feature === "flashcard_review" ||
    input.feature.startsWith("exempt:");

  if (
    caps?.research_paused &&
    input.feature.toLowerCase().includes("research")
  ) {
    await insertAiCall({
      feature: input.feature,
      model: modelLabel,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      person_id: input.personId ?? null,
      refused: true,
      refuse_reason: "research_paused",
    });
    return {
      ok: false,
      refused: true,
      reason: "Research is paused by the technical admin.",
      monthlySpend: spent,
      monthlyCap: cap,
    };
  }

  if (!exempt && spent + estimated > cap) {
    await insertAiCall({
      feature: input.feature,
      model: modelLabel,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      person_id: input.personId ?? null,
      refused: true,
      refuse_reason: "monthly_cap",
    });
    await logActivity({
      person_id: input.personId ?? null,
      action: "ai_cap_refused",
      target: input.feature,
      meta: { spent, cap },
    });
    return {
      ok: false,
      refused: true,
      reason:
        "Monthly Cruxy spend cap reached. Reading and flashcard review still work.",
      monthlySpend: spent,
      monthlyCap: cap,
    };
  }

  const per = featureCap(input.feature, caps);
  if (per != null && estimated > per) {
    await insertAiCall({
      feature: input.feature,
      model: modelLabel,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      person_id: input.personId ?? null,
      refused: true,
      refuse_reason: "feature_cap",
    });
    return {
      ok: false,
      refused: true,
      reason: `This call would exceed the per-feature cap ($${per}).`,
      monthlySpend: spent,
      monthlyCap: cap,
    };
  }

  if (spent / cap >= CAP_ALERT_RATIO && spent / cap < 1) {
    await logActivity({
      person_id: null,
      action: "ai_cap_alert_80",
      target: "jainam",
      meta: { spent, cap },
    });
  }

  if (!hasAiKey()) {
    const tokensIn = estimateTokens(input.messages);
    const tokensOut = 48;
    const costUsd = estimateCost(tokensIn, tokensOut);
    const text =
      "[Cruxy stub] AI gateway key not configured yet. " +
      "I would answer from your Truth Sources once AI_GATEWAY_API_KEY is set. " +
      "For now: what are you trying to figure out?";

    await insertAiCall({
      feature: input.feature,
      model: `${modelLabel}:stub`,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: costUsd,
      person_id: input.personId ?? null,
      refused: false,
      refuse_reason: null,
    });

    // Citation hook still runs on stubs when a corpus is provided.
    const guarded = await applyOptionalCitationGuard(
      text,
      input.citationCorpus,
      input.feature,
      input.personId,
    );

    return {
      ok: true,
      text: guarded,
      model: `${modelLabel}:stub`,
      tokensIn,
      tokensOut,
      costUsd,
      stub: true,
    };
  }

  const effort = resolveEffort(tier, input.feature, input.effort);
  const fallbacks = setting.fallbacks.filter(Boolean);

  try {
    const result = await generateText({
      model: setting.model,
      messages: input.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      ...(effort ? { reasoning: effort } : {}),
      ...(input.webSearch
        ? {
            tools: {
              exa_search: gateway.tools.exaSearch({
                type: "fast",
                numResults: 5,
                contents: { highlights: true },
              }),
            },
            stopWhen: stepCountIs(3),
          }
        : {}),
      providerOptions: {
        gateway: {
          zeroDataRetention: true,
          ...(fallbacks.length > 0 ? { models: fallbacks } : {}),
        },
      },
    });

    const meta = result.providerMetadata as
      | Record<string, unknown>
      | undefined;
    const tokensIn = result.usage.inputTokens ?? estimateTokens(input.messages);
    const tokensOut = result.usage.outputTokens ?? 0;
    const reported = gatewayCost(meta);
    const costUsd =
      reported != null ? reported : estimateCost(tokensIn, tokensOut);
    const modelUsed = answeredModel(
      result.response?.modelId,
      meta,
      setting.model,
    );
    const zdr = gatewayZdr(meta);

    await insertAiCall({
      feature: input.feature,
      model: modelUsed,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: costUsd,
      person_id: input.personId ?? null,
      refused: false,
      refuse_reason: null,
    });

    const guarded = await applyOptionalCitationGuard(
      result.text,
      input.citationCorpus,
      input.feature,
      input.personId,
    );

    return {
      ok: true,
      text: guarded,
      model: modelUsed,
      tokensIn,
      tokensOut,
      costUsd,
      stub: false,
      zeroDataRetention: zdr,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Cruxy gateway call failed.";
    // ZDR with no remaining providers, auth, or other gateway failures: log and refuse.
    // Never silently route around ZDR.
    await insertAiCall({
      feature: input.feature,
      model: modelLabel,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      person_id: input.personId ?? null,
      refused: true,
      refuse_reason: message.toLowerCase().includes("zdr")
        ? "no_zdr_providers"
        : "gateway_error",
    });
    await logActivity({
      person_id: input.personId ?? null,
      action: "ai_gateway_error",
      target: input.feature,
      meta: {
        tier,
        model: modelLabel,
        // Never log keys or full prompts.
        error: message.slice(0, 400),
      },
    });
    return {
      ok: false,
      refused: true,
      reason: "Cruxy could not reach a safe model path. Try again shortly.",
      monthlySpend: spent,
      monthlyCap: cap,
    };
  }
}

export type EmbedCruxyInput = {
  feature: string;
  value: string;
  personId?: string | null;
  estimatedCostUsd?: number;
};

export type EmbedCruxyResult =
  | {
      ok: true;
      embedding: number[];
      model: string;
      tokensIn: number;
      costUsd: number;
      stub: boolean;
    }
  | {
      ok: false;
      refused: true;
      reason: string;
    };

/**
 * Embeddings through the same gateway (embed tier). No model fallback —
 * a different embedding model would break vector search. Retries on failure.
 */
export async function embedCruxy(
  input: EmbedCruxyInput,
): Promise<EmbedCruxyResult> {
  const setting = await getModelSetting("embed");
  const cap = await monthlyCap();
  const spent = await sumMonthlySpendUsd();
  const estimated = input.estimatedCostUsd ?? 0.0001;

  if (spent + estimated > cap) {
    await insertAiCall({
      feature: input.feature,
      model: setting.model,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      person_id: input.personId ?? null,
      refused: true,
      refuse_reason: "monthly_cap",
    });
    return {
      ok: false,
      refused: true,
      reason: "Monthly Cruxy spend cap reached.",
    };
  }

  if (!hasAiKey()) {
    await insertAiCall({
      feature: input.feature,
      model: `${setting.model}:stub`,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      person_id: input.personId ?? null,
      refused: false,
      refuse_reason: null,
    });
    return {
      ok: true,
      embedding: [],
      model: `${setting.model}:stub`,
      tokensIn: 0,
      costUsd: 0,
      stub: true,
    };
  }

  try {
    const result = await embed({
      model: setting.model,
      value: input.value,
      maxRetries: 2,
      providerOptions: {
        gateway: {
          zeroDataRetention: true,
        },
      },
    });

    const meta = result.providerMetadata as
      | Record<string, unknown>
      | undefined;
    const tokensIn =
      (result.usage as { tokens?: number } | undefined)?.tokens ?? 0;
    const reported = gatewayCost(meta);
    const costUsd = reported != null ? reported : estimated;

    await insertAiCall({
      feature: input.feature,
      model: setting.model,
      tokens_in: tokensIn,
      tokens_out: 0,
      cost_usd: costUsd,
      person_id: input.personId ?? null,
      refused: false,
      refuse_reason: null,
    });

    return {
      ok: true,
      embedding: result.embedding,
      model: setting.model,
      tokensIn,
      costUsd,
      stub: false,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Embedding call failed.";
    await insertAiCall({
      feature: input.feature,
      model: setting.model,
      tokens_in: 0,
      tokens_out: 0,
      cost_usd: 0,
      person_id: input.personId ?? null,
      refused: true,
      refuse_reason: message.toLowerCase().includes("zdr")
        ? "no_zdr_providers"
        : "gateway_error",
    });
    return {
      ok: false,
      refused: true,
      reason: "Cruxy could not embed that text. Try again shortly.",
    };
  }
}

/** Test helper: force monthly spend near cap. */
export async function __forceSpendForTests(amount: number, personId?: string) {
  await insertAiCall({
    feature: "test_spend",
    model: "test",
    tokens_in: 0,
    tokens_out: 0,
    cost_usd: amount,
    person_id: personId ?? null,
    refused: false,
    refuse_reason: null,
  });
}

export type { ModelTier, ReasoningEffort };
