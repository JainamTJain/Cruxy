import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { logActivity } from "@/lib/db/repository";
import {
  clampAppeScore,
  clampSlider,
  DEFAULT_DAILY_MINUTES,
  defaultAppeBaselines,
  migrateFromLegacySliders,
  parseDailyMinutes,
  parseExplanationStyle,
  parseFeedbackTone,
  parseFocusAreas,
  parseLearnedPrefs,
  type AppeBaselines,
  type DailyMinutes,
  type ExplanationStyle,
  type FeedbackTone,
  type FocusArea,
  type LearnedPrefs,
  type LearningProfile,
} from "@/lib/learning/types";
import { APPE_SCORE_ITEMS, type AppeItemKey } from "@/lib/practice/types";
import { nowIso } from "@/lib/utils";

type ProfileBag = {
  learning_profiles?: LearningProfile[];
};

function normalizeBaselines(raw: unknown): AppeBaselines {
  const out: AppeBaselines = {};
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  for (const item of APPE_SCORE_ITEMS) {
    const v = Number(src[item.key]);
    if (Number.isFinite(v)) out[item.key] = clampAppeScore(v);
  }
  return out;
}

function mapRow(row: Record<string, unknown>): LearningProfile {
  const legacy = {
    visual_verbal: clampSlider(Number(row.visual_verbal ?? 50)),
    analogies_formal: clampSlider(Number(row.analogies_formal ?? 50)),
    ethical_mechanization: clampSlider(Number(row.ethical_mechanization ?? 50)),
    short_deep: clampSlider(Number(row.short_deep ?? 50)),
    direct_gentle: clampSlider(Number(row.direct_gentle ?? 50)),
  };
  const appe_baselines = normalizeBaselines(row.appe_baselines);
  const migrated = migrateFromLegacySliders({
    ...legacy,
    appe_baselines,
    daily_minutes: parseDailyMinutes(row.daily_minutes),
    focus_areas: parseFocusAreas(row.focus_areas),
    explanation_style: parseExplanationStyle(row.explanation_style),
    feedback_tone: parseFeedbackTone(row.feedback_tone),
    learned_prefs: parseLearnedPrefs(row.learned_prefs),
  });

  return {
    person_id: String(row.person_id),
    ...legacy,
    daily_minutes: migrated.daily_minutes,
    focus_areas: migrated.focus_areas,
    explanation_style: migrated.explanation_style,
    feedback_tone: migrated.feedback_tone,
    learned_prefs: migrated.learned_prefs,
    appe_baselines,
    completed_at: (row.completed_at as string | null) ?? null,
    created_at: String(row.created_at ?? nowIso()),
    updated_at: String(row.updated_at ?? nowIso()),
  };
}

export async function getLearningProfile(
  personId: string,
): Promise<LearningProfile | null> {
  if (isSampleDataMode()) {
    const store = await readStore();
    const bag = store as unknown as ProfileBag;
    const raw = (bag.learning_profiles ?? []).find(
      (p) => p.person_id === personId,
    );
    if (!raw) return null;
    return mapRow(raw as unknown as Record<string, unknown>);
  }
  const sb = getServiceSupabase();
  const { data, error } = await sb
    .from("learning_profiles")
    .select("*")
    .eq("person_id", personId)
    .maybeSingle();
  if (error) throw new Error(`getLearningProfile: ${error.message}`);
  if (!data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function hasLearningProfile(personId: string): Promise<boolean> {
  const p = await getLearningProfile(personId);
  return Boolean(p?.completed_at);
}

export type UpsertLearningProfileInput = {
  personId: string;
  dailyMinutes?: DailyMinutes | null;
  focusAreas?: FocusArea[];
  explanationStyle?: ExplanationStyle | null;
  feedbackTone?: FeedbackTone | null;
  /** Skip / partial save still marks completed when true (default). */
  markComplete?: boolean;
  /** Legacy POST body support during transition. */
  sliders?: Partial<Record<string, number>>;
  appeBaselines?: AppeBaselines;
};

export async function upsertLearningProfile(
  input: UpsertLearningProfileInput,
): Promise<LearningProfile> {
  const prev = await getLearningProfile(input.personId);
  const at = nowIso();

  // Legacy slider POST → migrate into concrete fields.
  let fromLegacy: ReturnType<typeof migrateFromLegacySliders> | null = null;
  if (input.sliders && !input.dailyMinutes && !input.explanationStyle) {
    fromLegacy = migrateFromLegacySliders({
      visual_verbal: input.sliders.visual_verbal,
      analogies_formal: input.sliders.analogies_formal,
      ethical_mechanization: input.sliders.ethical_mechanization,
      short_deep: input.sliders.short_deep,
      direct_gentle: input.sliders.direct_gentle,
      appe_baselines: input.appeBaselines ?? prev?.appe_baselines,
      daily_minutes: prev?.daily_minutes ?? null,
      focus_areas: prev?.focus_areas,
      explanation_style: prev?.explanation_style ?? null,
      feedback_tone: prev?.feedback_tone ?? null,
      learned_prefs: prev?.learned_prefs,
    });
  }

  const focus_areas = parseFocusAreas(
    input.focusAreas ?? fromLegacy?.focus_areas ?? prev?.focus_areas ?? [],
  );
  const daily_minutes =
    input.dailyMinutes !== undefined
      ? input.dailyMinutes
      : (fromLegacy?.daily_minutes ??
        prev?.daily_minutes ??
        DEFAULT_DAILY_MINUTES);
  const explanation_style =
    input.explanationStyle !== undefined
      ? input.explanationStyle
      : (fromLegacy?.explanation_style ?? prev?.explanation_style ?? null);
  const feedback_tone =
    input.feedbackTone !== undefined
      ? input.feedbackTone
      : (fromLegacy?.feedback_tone ?? prev?.feedback_tone ?? null);
  const learned_prefs =
    fromLegacy?.learned_prefs ?? prev?.learned_prefs ?? {};
  const appe_baselines = normalizeBaselines(
    input.appeBaselines ?? prev?.appe_baselines ?? {},
  );

  const markComplete = input.markComplete !== false;
  const row: LearningProfile = {
    person_id: input.personId,
    daily_minutes,
    focus_areas,
    explanation_style,
    feedback_tone,
    learned_prefs,
    appe_baselines,
    visual_verbal: prev?.visual_verbal ?? 50,
    analogies_formal: prev?.analogies_formal ?? 50,
    ethical_mechanization: prev?.ethical_mechanization ?? 50,
    short_deep: prev?.short_deep ?? 50,
    direct_gentle: prev?.direct_gentle ?? 50,
    completed_at: markComplete ? at : (prev?.completed_at ?? null),
    created_at: prev?.created_at ?? at,
    updated_at: at,
  };

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as unknown as ProfileBag;
      if (!bag.learning_profiles) bag.learning_profiles = [];
      const i = bag.learning_profiles.findIndex(
        (p) => p.person_id === input.personId,
      );
      if (i >= 0) bag.learning_profiles[i] = row;
      else bag.learning_profiles.push(row);
    });
  } else {
    const sb = getServiceSupabase();
    const { data, error } = await sb
      .from("learning_profiles")
      .upsert(
        {
          person_id: row.person_id,
          daily_minutes: row.daily_minutes,
          focus_areas: row.focus_areas,
          explanation_style: row.explanation_style,
          feedback_tone: row.feedback_tone,
          learned_prefs: row.learned_prefs,
          appe_baselines: row.appe_baselines,
          // Keep legacy columns stable for older readers.
          visual_verbal: row.visual_verbal ?? 50,
          analogies_formal: row.analogies_formal ?? 50,
          ethical_mechanization: row.ethical_mechanization ?? 50,
          short_deep: row.short_deep ?? 50,
          direct_gentle: row.direct_gentle ?? 50,
          completed_at: row.completed_at,
          updated_at: at,
        },
        { onConflict: "person_id" },
      )
      .select("*")
      .single();
    if (error) throw new Error(`upsertLearningProfile: ${error.message}`);
    Object.assign(row, mapRow(data as Record<string, unknown>));
  }

  await logActivity({
    person_id: input.personId,
    action: "learning_profile_saved",
    target: input.personId,
    meta: { id: randomUUID(), v: 2 },
  });

  return row;
}

export type PreferenceSignal = "shorter" | "example" | "more_detail";

export async function recordPreferenceSignal(
  personId: string,
  signal: PreferenceSignal,
): Promise<LearningProfile> {
  const prev =
    (await getLearningProfile(personId)) ??
    (await upsertLearningProfile({
      personId,
      markComplete: true,
      dailyMinutes: DEFAULT_DAILY_MINUTES,
    }));
  const learned: LearnedPrefs = { ...(prev.learned_prefs ?? {}) };
  if (signal === "shorter") {
    learned.shorter_count = (learned.shorter_count ?? 0) + 1;
    learned.prefer_shorter = true;
    learned.prefer_more_detail = false;
  } else if (signal === "example") {
    learned.example_count = (learned.example_count ?? 0) + 1;
    learned.prefer_example = true;
  } else {
    learned.more_detail_count = (learned.more_detail_count ?? 0) + 1;
    learned.prefer_more_detail = true;
    learned.prefer_shorter = false;
  }

  const explanation_style: ExplanationStyle | null =
    learned.prefer_example
      ? "example_first"
      : prev.explanation_style;

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as unknown as ProfileBag;
      const i = (bag.learning_profiles ?? []).findIndex(
        (p) => p.person_id === personId,
      );
      if (i < 0) return;
      bag.learning_profiles![i] = {
        ...bag.learning_profiles![i]!,
        learned_prefs: learned,
        explanation_style,
        updated_at: nowIso(),
      };
    });
  } else {
    const sb = getServiceSupabase();
    const { error } = await sb
      .from("learning_profiles")
      .update({
        learned_prefs: learned,
        explanation_style,
        updated_at: nowIso(),
      })
      .eq("person_id", personId);
    if (error) throw new Error(`recordPreferenceSignal: ${error.message}`);
  }

  await logActivity({
    person_id: personId,
    action: "learning_profile_signal",
    target: personId,
    meta: { signal },
  });

  return (await getLearningProfile(personId))!;
}

export async function resetLearnedPrefs(
  personId: string,
): Promise<LearningProfile | null> {
  const prev = await getLearningProfile(personId);
  if (!prev) return null;
  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as unknown as ProfileBag;
      const i = (bag.learning_profiles ?? []).findIndex(
        (p) => p.person_id === personId,
      );
      if (i < 0) return;
      bag.learning_profiles![i] = {
        ...bag.learning_profiles![i]!,
        learned_prefs: {},
        updated_at: nowIso(),
      };
    });
  } else {
    const sb = getServiceSupabase();
    const { error } = await sb
      .from("learning_profiles")
      .update({ learned_prefs: {}, updated_at: nowIso() })
      .eq("person_id", personId);
    if (error) throw new Error(`resetLearnedPrefs: ${error.message}`);
  }
  await logActivity({
    person_id: personId,
    action: "learning_profile_learned_reset",
    target: personId,
    meta: {},
  });
  return getLearningProfile(personId);
}

/**
 * Weakest APPE item for roadmap lean.
 * Prefers focus areas, then recent personal feedback, then first judge-card
 * means. Never fixed cutoffs or other people.
 */
export async function weakestAppeItemForPerson(
  personId: string,
): Promise<{ key: AppeItemKey; label: string; source: "focus" | "feedback" | "judge" | "baseline" } | null> {
  const profile = await getLearningProfile(personId);
  if (profile?.focus_areas?.length) {
    const area = profile.focus_areas[0]!;
    const key: AppeItemKey =
      area === "presenting"
        ? "presentation_a"
        : area === "commenting"
          ? "commentary"
          : area === "answering_judges"
            ? "response_to_judges"
            : "response_to_commentary";
    const label =
      APPE_SCORE_ITEMS.find((i) => i.key === key)?.label ?? key;
    return { key, label, source: "focus" };
  }

  if (isSampleDataMode()) {
    const store = await readStore();
    const counts = new Map<AppeItemKey, number>();
    for (const f of store.feedback_items ?? []) {
      if (f.person_id !== personId || f.kind !== "fix") continue;
      const key = f.scoring_item as AppeItemKey | null;
      if (!key || !APPE_SCORE_ITEMS.some((i) => i.key === key)) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (counts.size > 0) {
      let worst: AppeItemKey | null = null;
      let worstN = -1;
      for (const [k, n] of counts) {
        if (n > worstN) {
          worstN = n;
          worst = k;
        }
      }
      if (worst) {
        const label =
          APPE_SCORE_ITEMS.find((i) => i.key === worst)?.label ?? worst;
        return { key: worst, label, source: "feedback" };
      }
    }
  } else {
    const sb = getServiceSupabase();
    const { data } = await sb
      .from("feedback_items")
      .select("scoring_item")
      .eq("person_id", personId)
      .eq("kind", "fix")
      .not("scoring_item", "is", null)
      .limit(40);
    const counts = new Map<AppeItemKey, number>();
    for (const row of data ?? []) {
      const key = row.scoring_item as AppeItemKey;
      if (!APPE_SCORE_ITEMS.some((i) => i.key === key)) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (counts.size > 0) {
      let worst: AppeItemKey | null = null;
      let worstN = -1;
      for (const [k, n] of counts) {
        if (n > worstN) {
          worstN = n;
          worst = k;
        }
      }
      if (worst) {
        const label =
          APPE_SCORE_ITEMS.find((i) => i.key === worst)?.label ?? worst;
        return { key: worst, label, source: "feedback" };
      }
    }
  }

  // Fall back to stored baselines only if present (legacy).
  const baselines = profile?.appe_baselines ?? {};
  let worstKey: AppeItemKey | null = null;
  let worstVal = Infinity;
  for (const item of APPE_SCORE_ITEMS) {
    const v = baselines[item.key];
    if (typeof v !== "number") continue;
    if (v < worstVal) {
      worstVal = v;
      worstKey = item.key;
    }
  }
  if (!worstKey) return null;
  const label =
    APPE_SCORE_ITEMS.find((i) => i.key === worstKey)?.label ?? worstKey;
  return { key: worstKey, label, source: "baseline" };
}

/** @deprecated Prefer concrete upsert; kept for callers that still import defaults. */
export { defaultAppeBaselines };
