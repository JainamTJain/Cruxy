/**
 * Learning profile shape (Wave 8 D). H reads it when present; D owns the table.
 * Sliders are 0..100. Midpoint 50 is the sensible default.
 */
export type LearningProfile = {
  person_id: string;
  /** 0 = visual, 100 = verbal */
  visual_vs_verbal: number;
  /** 0 = analogies, 100 = formal logic */
  analogies_vs_formal: number;
  /** 0 = ethical analysis, 100 = logical mechanization */
  ethical_vs_logical: number;
  /** 0 = short answers, 100 = deep answers */
  short_vs_deep: number;
  /** 0 = direct feedback, 100 = gentle feedback */
  direct_vs_gentle: number;
  /** Baseline self-rating per APPE scoring item (1..5 or 0..100). */
  appe_baseline?: Record<string, number> | null;
  updated_at?: string | null;
};

export const LEARNING_PROFILE_DEFAULTS: Omit<
  LearningProfile,
  "person_id" | "updated_at" | "appe_baseline"
> = {
  visual_vs_verbal: 50,
  analogies_vs_formal: 50,
  ethical_vs_logical: 40,
  short_vs_deep: 40,
  direct_vs_gentle: 40,
};
