/**
 * Check a distilled reading point for a logical fallacy (tier small).
 * Results are cached by sha256 of the displayed text.
 */
import "server-only";

import { createHash } from "crypto";
import { z } from "zod";
import { runAgent } from "@/lib/cruxy/agents/runAgent";
import { FALLACY_NAMES } from "@/lib/critique/types";
import {
  getFallacyCache,
  upsertFallacyCache,
} from "@/lib/db/supabase/file-segment-overrides";
import type {
  SegmentFallacyCacheRow,
  SegmentFallacyFlag,
} from "@/lib/case-home/types";

const schema = z.object({
  sound: z.boolean(),
  fallacy_name: z.string().nullable(),
  why: z.string().nullable(),
  better: z.string().nullable(),
});

export function hashPointText(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

/** Cheap local pass when the gateway is off (sample / CI). */
function ruleStub(text: string): z.infer<typeof schema> {
  const t = text.trim();
  if (/\b(always|never|everyone|no one|nobody)\b/i.test(t)) {
    return {
      sound: false,
      fallacy_name: "Hasty generalization",
      why: "An absolute word makes the claim false the moment a judge names one exception.",
      better: t
        .replace(/\balways\b/gi, "often")
        .replace(/\bnever\b/gi, "rarely")
        .replace(/\beveryone\b/gi, "many people")
        .replace(/\bno one\b/gi, "few people")
        .replace(/\bnobody\b/gi, "few people"),
    };
  }
  if (/\beither\b.+\bor\b/i.test(t) || /\bthe only (way|option|choice)\b/i.test(t)) {
    return {
      sound: false,
      fallacy_name: "False dilemma",
      why: "It offers two options when a judge can name a third, so the conclusion does not follow.",
      better: `${t.replace(/\.$/, "")} (unless a middle option holds).`,
    };
  }
  if (/\b(will (inevitably )?lead to|inevitably|slippery slope)\b/i.test(t)) {
    return {
      sound: false,
      fallacy_name: "Slippery slope without a stopping point",
      why: "It predicts a chain of results without showing why each step follows or where it would stop.",
      better: t
        .replace(/\binevitably\b/gi, "may")
        .replace(/\bwill lead to\b/gi, "could lead to"),
    };
  }
  return { sound: true, fallacy_name: null, why: null, better: null };
}

function toFlag(row: SegmentFallacyCacheRow): SegmentFallacyFlag | null {
  if (row.sound || !row.fallacy_name || !row.why || !row.better_wording) {
    return null;
  }
  return {
    name: row.fallacy_name,
    why: row.why,
    better: row.better_wording,
  };
}

/**
 * Return a fallacy flag for this point text, or null when it is sound.
 * Uses the cache when the hash matches; otherwise calls Cruxy (tier small).
 */
export async function checkPointFallacy(args: {
  text: string;
  personId?: string | null;
}): Promise<SegmentFallacyFlag | null> {
  const text = args.text.trim();
  if (text.length < 12) return null;
  const textHash = hashPointText(text);
  const cached = await getFallacyCache(textHash);
  if (cached) return toFlag(cached);

  const result = await runAgent({
    agent: "coach",
    feature: "reading_point_fallacy",
    tier: "small",
    system: [
      "You are Cruxy checking one short Ethics Bowl prep note for a logical fallacy.",
      "Use only these fallacy names when one applies:",
      FALLACY_NAMES.join("; ") + ".",
      "If the point is sound, set sound true and the other fields null.",
      "If it is weak, name the fallacy, give one plain line on why a judge would mark it, and suggest better wording the team can paste in.",
      "Plain words. No em dashes. No model names. Output JSON only.",
    ].join("\n"),
    user: `Point:\n${text}`,
    schema,
    personId: args.personId ?? null,
    fixtureKey: "reading_point_fallacy",
    estimatedCostUsd: 0.01,
    stubFallback: () => ruleStub(text),
  });

  const data = result.ok ? result.data : ruleStub(text);
  const row = await upsertFallacyCache({
    text_hash: textHash,
    sound: data.sound || !data.fallacy_name,
    fallacy_name: data.sound ? null : data.fallacy_name,
    why: data.sound ? null : data.why,
    better_wording: data.sound ? null : data.better,
  });
  return toFlag(row);
}

/** Check many points; preserves order. */
export async function checkPointsFallacies(
  texts: string[],
  personId?: string | null,
): Promise<(SegmentFallacyFlag | null)[]> {
  return Promise.all(texts.map((text) => checkPointFallacy({ text, personId })));
}
