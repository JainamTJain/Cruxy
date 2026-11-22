/**
 * Soft read of the learning profile for research and other agents.
 * Thin adapter over Wave 8 D's profile store: never throws into callers.
 */
import "server-only";

import { formatLearningProfileSummary } from "@/lib/learning/summary";
import type { LearningProfile } from "@/lib/learning/types";

/** Read the person's learning profile, or null when unknown or unavailable. */
export async function getLearningProfile(
  personId: string | null | undefined,
): Promise<LearningProfile | null> {
  if (!personId) return null;
  try {
    const { getLearningProfile: read } = await import("@/lib/learning/profile");
    return await read(personId);
  } catch {
    return null;
  }
}

/** Prompt block so Cruxy fits how this person learns. Empty when unknown. */
export function learningProfilePromptBlock(
  profile: LearningProfile | null | undefined,
): string {
  return formatLearningProfileSummary(profile) ?? "";
}
