import {
  CAP_ALERT_RATIO,
  MONTHLY_CAP_USD_DEFAULT,
  PER_PERSON_ASSISTANT_DAY_CAP_USD,
  PER_RESEARCH_NIGHT_CAP_USD,
  PER_ROUND_CAP_USD,
} from "@/lib/constants";
import { insertAiCall, logActivity, sumMonthlySpendUsd } from "@/lib/db/repository";

export type CruxyMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CallCruxyInput = {
  feature: string;
  model: string;
  messages: CruxyMessage[];
  personId?: string | null;
  /** Estimated cost before calling; used for cap checks. */
  estimatedCostUsd?: number;
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
    }
  | {
      ok: false;
      refused: true;
      reason: string;
      monthlySpend: number;
      monthlyCap: number;
    };

function monthlyCap(): number {
  const n = Number(process.env.MONTHLY_CAP_USD ?? MONTHLY_CAP_USD_DEFAULT);
  return Number.isFinite(n) ? n : MONTHLY_CAP_USD_DEFAULT;
}

function hasAiKey(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() ||
      process.env.OPENROUTER_API_KEY?.trim(),
  );
}

function estimateTokens(messages: CruxyMessage[]) {
  const chars = messages.reduce((n, m) => n + m.content.length, 0);
  return Math.max(1, Math.ceil(chars / 4));
}

/** Rough USD estimate for stub / pre-check (Flash-lite-ish). */
function estimateCost(tokensIn: number, tokensOut: number) {
  return (tokensIn * 0.00000025 + tokensOut * 0.000001) || 0.0001;
}

function featureCap(feature: string): number | null {
  const f = feature.toLowerCase();
  if (f.includes("round") || f.includes("judge") || f.includes("report")) {
    return PER_ROUND_CAP_USD;
  }
  if (f.includes("research")) return PER_RESEARCH_NIGHT_CAP_USD;
  if (f.includes("assistant") || f.includes("drawer")) {
    return PER_PERSON_ASSISTANT_DAY_CAP_USD;
  }
  return null;
}

/**
 * Single AI gateway. Logs every call to ai_calls.
 * Refuses when monthly cap is reached (reading / flashcard review exempt).
 * Stubs a response when AI keys are missing (Track 0).
 */
export async function callCruxy(
  input: CallCruxyInput,
): Promise<CallCruxyResult> {
  const cap = monthlyCap();
  const spent = await sumMonthlySpendUsd();
  const estimated =
    input.estimatedCostUsd ??
    estimateCost(estimateTokens(input.messages), 200);

  const exempt =
    input.feature === "reading" ||
    input.feature === "flashcard_review" ||
    input.feature.startsWith("exempt:");

  if (!exempt && spent + estimated > cap) {
    await insertAiCall({
      feature: input.feature,
      model: input.model,
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

  const per = featureCap(input.feature);
  if (per != null && estimated > per) {
    await insertAiCall({
      feature: input.feature,
      model: input.model,
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

  // TODO: wire Vercel AI SDK + AI Gateway / OpenRouter when key is present
  if (!hasAiKey()) {
    const tokensIn = estimateTokens(input.messages);
    const tokensOut = 48;
    const costUsd = estimateCost(tokensIn, tokensOut);
    const text =
      "[Cruxy stub] AI gateway key not configured yet. " +
      "I would answer from your Truth Sources once OPENROUTER_API_KEY or AI_GATEWAY_API_KEY is set. " +
      "For now: what are you trying to figure out?";

    await insertAiCall({
      feature: input.feature,
      model: `${input.model}:stub`,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: costUsd,
      person_id: input.personId ?? null,
      refused: false,
      refuse_reason: null,
    });

    return {
      ok: true,
      text,
      model: `${input.model}:stub`,
      tokensIn,
      tokensOut,
      costUsd,
      stub: true,
    };
  }

  // Placeholder live path — still stub until Track 1+ wires providers.
  // Keys may be present but Track 0 keeps a safe stub to avoid spend surprises.
  const tokensIn = estimateTokens(input.messages);
  const tokensOut = 64;
  const costUsd = estimateCost(tokensIn, tokensOut);
  const text =
    "[Cruxy] Provider key detected. Live model routing lands with Track 1+. " +
    "Ask before tell: what is the strongest objection to your claim?";

  await insertAiCall({
    feature: input.feature,
    model: input.model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: costUsd,
    person_id: input.personId ?? null,
    refused: false,
    refuse_reason: null,
  });

  return {
    ok: true,
    text,
    model: input.model,
    tokensIn,
    tokensOut,
    costUsd,
    stub: true,
  };
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
