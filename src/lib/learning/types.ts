import type { AppeItemKey } from "@/lib/practice/types";
import { APPE_SCORE_ITEMS } from "@/lib/practice/types";

/** Five quantitative style axes, each 0 to 100. */
export type LearningSliderKey =
  | "visual_verbal"
  | "analogies_formal"
  | "ethical_mechanization"
  | "short_deep"
  | "direct_gentle";

export type LearningSliders = Record<LearningSliderKey, number>;

export type AppeBaselines = Partial<Record<AppeItemKey, number>>;

export interface LearningProfile {
  person_id: string;
  visual_verbal: number;
  analogies_formal: number;
  ethical_mechanization: number;
  short_deep: number;
  direct_gentle: number;
  appe_baselines: AppeBaselines;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const LEARNING_SLIDER_META: {
  key: LearningSliderKey;
  left: string;
  right: string;
  help: string;
}[] = [
  {
    key: "visual_verbal",
    left: "Visual",
    right: "Verbal",
    help: "Diagrams and maps versus spoken and written explanation.",
  },
  {
    key: "analogies_formal",
    left: "Analogies",
    right: "Formal logic",
    help: "Everyday comparisons versus careful step-by-step reasoning.",
  },
  {
    key: "ethical_mechanization",
    left: "Ethical analysis",
    right: "Logical mechanization",
    help: "Moral stakes and stakeholders versus structure and validity.",
  },
  {
    key: "short_deep",
    left: "Short answers",
    right: "Deep answers",
    help: "Tight replies versus longer unpacking when you ask for more.",
  },
  {
    key: "direct_gentle",
    left: "Direct feedback",
    right: "Gentle feedback",
    help: "Plain critique versus softer wording that still names the weak spot.",
  },
];

export const DEFAULT_SLIDER = 50;
export const DEFAULT_APPE_BASELINE = 5;

export function defaultSliders(): LearningSliders {
  return {
    visual_verbal: DEFAULT_SLIDER,
    analogies_formal: DEFAULT_SLIDER,
    ethical_mechanization: DEFAULT_SLIDER,
    short_deep: DEFAULT_SLIDER,
    direct_gentle: DEFAULT_SLIDER,
  };
}

export function defaultAppeBaselines(): Record<AppeItemKey, number> {
  const out = {} as Record<AppeItemKey, number>;
  for (const item of APPE_SCORE_ITEMS) {
    out[item.key] = DEFAULT_APPE_BASELINE;
  }
  return out;
}

export function clampSlider(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SLIDER;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function clampAppeScore(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_APPE_BASELINE;
  return Math.min(10, Math.max(1, Math.round(n)));
}
