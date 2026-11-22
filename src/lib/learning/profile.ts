import "server-only";
import { randomUUID } from "crypto";
import { isSampleDataMode } from "@/lib/db/config";
import { readStore, updateStore } from "@/lib/db/sample-store";
import { getServiceSupabase } from "@/lib/db/supabase/client";
import { logActivity } from "@/lib/db/repository";
import {
  clampAppeScore,
  clampSlider,
  defaultAppeBaselines,
  defaultSliders,
  type AppeBaselines,
  type LearningProfile,
  type LearningSliders,
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
  return {
    person_id: String(row.person_id),
    visual_verbal: clampSlider(Number(row.visual_verbal)),
    analogies_formal: clampSlider(Number(row.analogies_formal)),
    ethical_mechanization: clampSlider(Number(row.ethical_mechanization)),
    short_deep: clampSlider(Number(row.short_deep)),
    direct_gentle: clampSlider(Number(row.direct_gentle)),
    appe_baselines: normalizeBaselines(row.appe_baselines),
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
    return (
      (bag.learning_profiles ?? []).find((p) => p.person_id === personId) ??
      null
    );
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

export async function upsertLearningProfile(input: {
  personId: string;
  sliders: Partial<LearningSliders>;
  appeBaselines: AppeBaselines;
}): Promise<LearningProfile> {
  const defaults = defaultSliders();
  const baselines = { ...defaultAppeBaselines(), ...normalizeBaselines(input.appeBaselines) };
  const at = nowIso();
  const row: LearningProfile = {
    person_id: input.personId,
    visual_verbal: clampSlider(
      input.sliders.visual_verbal ?? defaults.visual_verbal,
    ),
    analogies_formal: clampSlider(
      input.sliders.analogies_formal ?? defaults.analogies_formal,
    ),
    ethical_mechanization: clampSlider(
      input.sliders.ethical_mechanization ?? defaults.ethical_mechanization,
    ),
    short_deep: clampSlider(input.sliders.short_deep ?? defaults.short_deep),
    direct_gentle: clampSlider(
      input.sliders.direct_gentle ?? defaults.direct_gentle,
    ),
    appe_baselines: baselines,
    completed_at: at,
    created_at: at,
    updated_at: at,
  };

  if (isSampleDataMode()) {
    await updateStore((s) => {
      const bag = s as unknown as ProfileBag;
      if (!bag.learning_profiles) bag.learning_profiles = [];
      const i = bag.learning_profiles.findIndex(
        (p) => p.person_id === input.personId,
      );
      if (i >= 0) {
        const prev = bag.learning_profiles[i]!;
        bag.learning_profiles[i] = {
          ...row,
          created_at: prev.created_at,
          updated_at: at,
        };
      } else {
        bag.learning_profiles.push(row);
      }
    });
  } else {
    const sb = getServiceSupabase();
    const { data, error } = await sb
      .from("learning_profiles")
      .upsert(
        {
          person_id: row.person_id,
          visual_verbal: row.visual_verbal,
          analogies_formal: row.analogies_formal,
          ethical_mechanization: row.ethical_mechanization,
          short_deep: row.short_deep,
          direct_gentle: row.direct_gentle,
          appe_baselines: row.appe_baselines,
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
    meta: { id: randomUUID() },
  });

  return row;
}

/**
 * Weakest APPE item for roadmap lean.
 * Prefers recent personal feedback scoring items when present; else baseline
 * self-ratings. Compared only with this person's own data.
 */
export async function weakestAppeItemForPerson(
  personId: string,
): Promise<{ key: AppeItemKey; label: string; source: "feedback" | "baseline" } | null> {
  const profile = await getLearningProfile(personId);
  const baselines = profile?.appe_baselines ?? {};

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
