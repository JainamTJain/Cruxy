/**
 * Soft read of Wave 8 D's learning profile.
 * Returns null until D's `learning_profiles` table lands; never throws into callers.
 */
import "server-only";

import { isSampleDataMode } from "@/lib/db/config";
import type { LearningProfile } from "@/lib/learning/types";
import { LEARNING_PROFILE_DEFAULTS } from "@/lib/learning/types";

function clampSlider(n: unknown, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(100, Math.max(0, Math.round(v)));
}

function mapRow(row: Record<string, unknown>): LearningProfile {
  return {
    person_id: String(row.person_id ?? ""),
    visual_vs_verbal: clampSlider(
      row.visual_vs_verbal,
      LEARNING_PROFILE_DEFAULTS.visual_vs_verbal,
    ),
    analogies_vs_formal: clampSlider(
      row.analogies_vs_formal,
      LEARNING_PROFILE_DEFAULTS.analogies_vs_formal,
    ),
    ethical_vs_logical: clampSlider(
      row.ethical_vs_logical,
      LEARNING_PROFILE_DEFAULTS.ethical_vs_logical,
    ),
    short_vs_deep: clampSlider(
      row.short_vs_deep,
      LEARNING_PROFILE_DEFAULTS.short_vs_deep,
    ),
    direct_vs_gentle: clampSlider(
      row.direct_vs_gentle,
      LEARNING_PROFILE_DEFAULTS.direct_vs_gentle,
    ),
    appe_baseline:
      (row.appe_baseline as Record<string, number> | null | undefined) ?? null,
    updated_at: (row.updated_at as string | null | undefined) ?? null,
  };
}

/** Read the person's learning profile when D has stored one. */
export async function getLearningProfile(
  personId: string | null | undefined,
): Promise<LearningProfile | null> {
  if (!personId || isSampleDataMode()) return null;

  try {
    const { getServiceSupabase } = await import("@/lib/db/supabase/client");
    const { data, error } = await getServiceSupabase()
      .from("learning_profiles")
      .select("*")
      .eq("person_id", personId)
      .maybeSingle();
    if (error || !data) return null;
    return mapRow(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** Prompt block so Cruxy fits how this person learns. Empty when unknown. */
export function learningProfilePromptBlock(
  profile: LearningProfile | null | undefined,
): string {
  if (!profile) return "";
  const lines = [
    "Learner profile (fit explanations to this person):",
    `- Visual ${100 - profile.visual_vs_verbal} / verbal ${profile.visual_vs_verbal}`,
    `- Analogies ${100 - profile.analogies_vs_formal} / formal logic ${profile.analogies_vs_formal}`,
    `- Ethical analysis ${100 - profile.ethical_vs_logical} / logical mechanization ${profile.ethical_vs_logical}`,
    `- Prefer ${profile.short_vs_deep < 50 ? "short" : "deep"} answers`,
    `- Feedback tone: ${profile.direct_vs_gentle < 50 ? "direct" : "gentle"}`,
  ];
  return lines.join("\n");
}
