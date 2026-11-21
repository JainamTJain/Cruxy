/**
 * Model tier settings for Cruxy.
 * Defaults match Jainam's Nov 21, 2026 choices (docs/orchestration/model-routing.md).
 * Until Workstream 0 lands the shared Supabase client, reads come from these
 * constants (plus in-memory overrides from updateModelSettings). After rebase,
 * replace the constant path with a select from model_settings.
 */
import { logActivity } from "@/lib/db/repository";

export type ModelTier = "small" | "strong" | "embed";

export type ReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

export type ModelSettingRow = {
  tier: ModelTier;
  model: string;
  fallbacks: string[];
  effort_default: ReasoningEffort | null;
  updated_at: string | null;
  updated_by: string | null;
};

/** Jainam's decided defaults — also seeded in migration 00010. */
export const DEFAULT_MODEL_SETTINGS: Record<ModelTier, ModelSettingRow> = {
  small: {
    tier: "small",
    model: "openai/gpt-6-luna",
    fallbacks: ["google/gemini-3.8-flash"],
    effort_default: "low",
    updated_at: null,
    updated_by: null,
  },
  strong: {
    tier: "strong",
    model: "openai/gpt-6.2-sol",
    fallbacks: ["google/gemini-4-carbon"],
    effort_default: "medium",
    updated_at: null,
    updated_by: null,
  },
  embed: {
    tier: "embed",
    model: "openai/text-embedding-3-small",
    // No embedding fallback: google/text-embedding-005 is a different vector space.
    fallbacks: [],
    effort_default: null,
    updated_at: null,
    updated_by: null,
  },
};

const CACHE_TTL_MS = 60_000;

type CacheEntry = {
  at: number;
  rows: Record<ModelTier, ModelSettingRow>;
};

let cache: CacheEntry | null = null;
/** In-memory overrides until model_settings is read through the W0 server client. */
let overrides: Partial<Record<ModelTier, ModelSettingRow>> = {};

function cloneDefaults(): Record<ModelTier, ModelSettingRow> {
  return {
    small: { ...DEFAULT_MODEL_SETTINGS.small, fallbacks: [...DEFAULT_MODEL_SETTINGS.small.fallbacks] },
    strong: {
      ...DEFAULT_MODEL_SETTINGS.strong,
      fallbacks: [...DEFAULT_MODEL_SETTINGS.strong.fallbacks],
    },
    embed: {
      ...DEFAULT_MODEL_SETTINGS.embed,
      fallbacks: [...DEFAULT_MODEL_SETTINGS.embed.fallbacks],
    },
  };
}

function mergeRows(): Record<ModelTier, ModelSettingRow> {
  const base = cloneDefaults();
  for (const tier of Object.keys(overrides) as ModelTier[]) {
    const row = overrides[tier];
    if (row) base[tier] = { ...row, fallbacks: [...row.fallbacks] };
  }
  return base;
}

function readCached(): Record<ModelTier, ModelSettingRow> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cache.rows;
  }
  const rows = mergeRows();
  cache = { at: now, rows };
  return rows;
}

/** Invalidate the 60 s settings cache (used by update and tests). */
export function clearModelSettingsCache(): void {
  cache = null;
}

/**
 * Normalize legacy ad-hoc model names from early call sites / API bodies
 * to a tier. Prefer passing `tier` directly.
 */
export function normalizeTierName(name: string | undefined | null): ModelTier {
  const n = (name ?? "small").toLowerCase().trim();
  if (n === "strong") return "strong";
  if (n === "embed" || n === "embedding") return "embed";
  // small, analyst-small, cruxy-default, cruxy-admin, and anything else → small
  return "small";
}

export async function getModelSettings(): Promise<
  Record<ModelTier, ModelSettingRow>
> {
  return readCached();
}

export async function getModelSetting(
  tier: ModelTier,
): Promise<ModelSettingRow> {
  const all = await getModelSettings();
  return all[tier];
}

export type UpdateModelSettingsInput = {
  tier: ModelTier;
  model?: string;
  fallbacks?: string[];
  effort_default?: ReasoningEffort | null;
  updatedBy?: string | null;
};

/**
 * Update a tier's primary / fallbacks / effort default.
 * Writes activity_log. Persists in-memory until W0 wires model_settings reads;
 * after rebase, also upsert the row via the shared server client.
 */
export async function updateModelSettings(
  input: UpdateModelSettingsInput,
): Promise<ModelSettingRow> {
  const current = (await getModelSettings())[input.tier];
  const next: ModelSettingRow = {
    ...current,
    model: input.model ?? current.model,
    fallbacks: input.fallbacks ?? [...current.fallbacks],
    effort_default:
      input.effort_default !== undefined
        ? input.effort_default
        : current.effort_default,
    updated_at: new Date().toISOString(),
    updated_by: input.updatedBy ?? current.updated_by,
  };

  overrides[input.tier] = next;
  clearModelSettingsCache();

  await logActivity({
    person_id: input.updatedBy ?? null,
    action: "model_settings_updated",
    target: input.tier,
    meta: {
      model: next.model,
      fallbacks: next.fallbacks,
      effort_default: next.effort_default,
    },
  });

  return next;
}

/** Reset in-memory overrides to seeded defaults (tests / live-check cleanup). */
export async function resetModelSettingsOverrides(): Promise<void> {
  overrides = {};
  clearModelSettingsCache();
}

/**
 * Pick reasoning effort for a call: explicit input, then feature heuristics,
 * then the tier's effort_default.
 */
export function resolveEffort(
  tier: "small" | "strong",
  feature: string,
  explicit?: ReasoningEffort | null,
): ReasoningEffort | undefined {
  if (explicit) return explicit;

  const f = feature.toLowerCase();

  if (tier === "small") {
    if (
      f.includes("tag") ||
      f.includes("sort") ||
      f.includes("digest") ||
      f.includes("flashcard")
    ) {
      return "none";
    }
    if (
      f.includes("assistant") ||
      f.includes("drawer") ||
      f.includes("moderator") ||
      f.includes("admin")
    ) {
      return "low";
    }
    return DEFAULT_MODEL_SETTINGS.small.effort_default ?? "low";
  }

  // strong
  if (
    f.includes("opponent") ||
    f.includes("round") ||
    (f.includes("moderator") && f.includes("live"))
  ) {
    return "low";
  }
  if (
    f.includes("judge") ||
    f.includes("analyst") ||
    f.includes("coach") ||
    f.includes("socratic") ||
    f.includes("verif")
  ) {
    return "medium";
  }
  return DEFAULT_MODEL_SETTINGS.strong.effort_default ?? "medium";
}
