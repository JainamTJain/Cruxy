import { APPE_SCORE_ITEMS, type AppeItemKey } from "@/lib/practice/types";
import {
  LEARNING_SLIDER_META,
  type LearningProfile,
  type LearningSliderKey,
} from "@/lib/learning/types";

function polePhrase(
  key: LearningSliderKey,
  value: number,
): string {
  const meta = LEARNING_SLIDER_META.find((m) => m.key === key)!;
  if (value <= 35) return `prefers ${meta.left.toLowerCase()}`;
  if (value >= 65) return `prefers ${meta.right.toLowerCase()}`;
  return `balanced between ${meta.left.toLowerCase()} and ${meta.right.toLowerCase()}`;
}

/** Weakest APPE baseline keys (ties included), for roadmap lean. */
export function weakestAppeBaselines(
  baselines: Partial<Record<AppeItemKey, number>>,
): AppeItemKey[] {
  let min = Infinity;
  for (const item of APPE_SCORE_ITEMS) {
    const v = baselines[item.key];
    if (typeof v === "number" && v < min) min = v;
  }
  if (!Number.isFinite(min)) return [];
  return APPE_SCORE_ITEMS.filter((i) => baselines[i.key] === min).map(
    (i) => i.key,
  );
}

/**
 * Short natural-language summary for Cruxy system context.
 * No secrets; safe to put in prompts.
 */
export function formatLearningProfileSummary(
  profile: LearningProfile | null | undefined,
): string | null {
  if (!profile) return null;
  const style = LEARNING_SLIDER_META.map((m) =>
    polePhrase(m.key, profile[m.key]),
  ).join("; ");

  const weak = weakestAppeBaselines(profile.appe_baselines);
  const weakLabels = weak
    .map(
      (k) =>
        APPE_SCORE_ITEMS.find((i) => i.key === k)?.label ?? k,
    )
    .join(", ");

  const baselineBits = APPE_SCORE_ITEMS.map((i) => {
    const v = profile.appe_baselines[i.key];
    return v != null ? `${i.label} ${v}/10` : null;
  }).filter(Boolean);

  const lines = [
    "Adapt explanations to this person's learning profile.",
    `Style: ${style}.`,
    baselineBits.length
      ? `Self-rated APPE baselines: ${baselineBits.join("; ")}.`
      : null,
    weakLabels
      ? `Lean practice toward weaker card items: ${weakLabels}.`
      : null,
    "Stay plain. Match short vs deep and direct vs gentle from the style line.",
  ].filter(Boolean);

  return lines.join("\n");
}
