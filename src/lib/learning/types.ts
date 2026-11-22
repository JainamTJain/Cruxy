import type { AppeItemKey } from "@/lib/practice/types";
import { APPE_SCORE_ITEMS } from "@/lib/practice/types";

/** Weekday prep budget until Dec 5. */
export type DailyMinutes = 10 | 20 | 45 | 60;

/** Round parts the person most wants to improve (pick up to two). */
export type FocusArea =
  | "presenting"
  | "commenting"
  | "answering_judges"
  | "thinking_on_feet";

export type ExplanationStyle = "example_first" | "steps_first";
export type FeedbackTone = "blunt" | "gentle";

/** Chips under Cruxy replies update these quietly. */
export type LearnedPrefs = {
  prefer_shorter?: boolean;
  prefer_example?: boolean;
  prefer_more_detail?: boolean;
  shorter_count?: number;
  example_count?: number;
  more_detail_count?: number;
};

/** Legacy slider keys (kept for migration reads). */
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
  daily_minutes: DailyMinutes | null;
  focus_areas: FocusArea[];
  explanation_style: ExplanationStyle | null;
  feedback_tone: FeedbackTone | null;
  learned_prefs: LearnedPrefs;
  /** Legacy; not collected in v2. Progress uses first judge card instead. */
  appe_baselines: AppeBaselines;
  /** Legacy slider values when present (migration / soft read). */
  visual_verbal?: number;
  analogies_formal?: number;
  ethical_mechanization?: number;
  short_deep?: number;
  direct_gentle?: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const DAILY_MINUTES_OPTIONS: {
  value: DailyMinutes;
  label: string;
  help: string;
}[] = [
  { value: 10, label: "10 minutes", help: "One short drill or a few cards." },
  { value: 20, label: "20 minutes", help: "A focused block on Today." },
  { value: 45, label: "45 minutes", help: "A case chunk plus a drill." },
  { value: 60, label: "60+ minutes", help: "A fuller practice session." },
];

export const FOCUS_AREA_OPTIONS: {
  value: FocusArea;
  label: string;
}[] = [
  { value: "presenting", label: "Presenting our case" },
  { value: "commenting", label: "Commenting on the other team" },
  { value: "answering_judges", label: "Answering judges' questions" },
  { value: "thinking_on_feet", label: "Thinking on my feet" },
];

export const EXPLANATION_SAMPLES: {
  style: ExplanationStyle;
  label: string;
  body: string;
}[] = [
  {
    style: "example_first",
    label: "A",
    body:
      "Like lending a friend your spare room: the duty to help sits next to the duty to keep your own life stable. Start there, then name the rule.",
  },
  {
    style: "steps_first",
    label: "B",
    body:
      "1) Name the conflicting duties. 2) Say which weighs more here and why. 3) Check one hard case that would flip the answer.",
  },
];

export const FEEDBACK_SAMPLES: {
  tone: FeedbackTone;
  label: string;
  body: string;
}[] = [
  {
    tone: "blunt",
    label: "Blunt",
    body:
      "Your thesis never landed. Open with the claim in one sentence, then the reason.",
  },
  {
    tone: "gentle",
    label: "Gentle",
    body:
      "The claim is almost there. Try opening with one clear sentence of your stance, then the reason.",
  },
];

export const DEFAULT_SLIDER = 50;
export const DEFAULT_APPE_BASELINE = 5;
export const DEFAULT_DAILY_MINUTES: DailyMinutes = 20;

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

export function parseDailyMinutes(v: unknown): DailyMinutes | null {
  const n = Number(v);
  if (n === 10 || n === 20 || n === 45 || n === 60) return n;
  return null;
}

export function parseFocusAreas(raw: unknown): FocusArea[] {
  const allowed = new Set(FOCUS_AREA_OPTIONS.map((o) => o.value));
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(",").map((s) => s.trim())
      : [];
  const out: FocusArea[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    if (!allowed.has(item as FocusArea)) continue;
    if (out.includes(item as FocusArea)) continue;
    out.push(item as FocusArea);
    if (out.length >= 2) break;
  }
  return out;
}

export function parseExplanationStyle(v: unknown): ExplanationStyle | null {
  return v === "example_first" || v === "steps_first" ? v : null;
}

export function parseFeedbackTone(v: unknown): FeedbackTone | null {
  return v === "blunt" || v === "gentle" ? v : null;
}

export function parseLearnedPrefs(raw: unknown): LearnedPrefs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const out: LearnedPrefs = {};
  if (typeof o.prefer_shorter === "boolean") out.prefer_shorter = o.prefer_shorter;
  if (typeof o.prefer_example === "boolean") out.prefer_example = o.prefer_example;
  if (typeof o.prefer_more_detail === "boolean") {
    out.prefer_more_detail = o.prefer_more_detail;
  }
  for (const k of ["shorter_count", "example_count", "more_detail_count"] as const) {
    const n = Number(o[k]);
    if (Number.isFinite(n) && n >= 0) out[k] = Math.round(n);
  }
  return out;
}

/** Map legacy slider row → concrete v2 fields when new columns are empty. */
export function migrateFromLegacySliders(row: {
  visual_verbal?: number;
  analogies_formal?: number;
  ethical_mechanization?: number;
  short_deep?: number;
  direct_gentle?: number;
  appe_baselines?: AppeBaselines;
  daily_minutes?: DailyMinutes | null;
  focus_areas?: FocusArea[];
  explanation_style?: ExplanationStyle | null;
  feedback_tone?: FeedbackTone | null;
  learned_prefs?: LearnedPrefs;
}): {
  daily_minutes: DailyMinutes | null;
  focus_areas: FocusArea[];
  explanation_style: ExplanationStyle | null;
  feedback_tone: FeedbackTone | null;
  learned_prefs: LearnedPrefs;
} {
  const analogies = clampSlider(Number(row.analogies_formal ?? DEFAULT_SLIDER));
  const direct = clampSlider(Number(row.direct_gentle ?? DEFAULT_SLIDER));
  const shortDeep = clampSlider(Number(row.short_deep ?? DEFAULT_SLIDER));
  const visual = clampSlider(Number(row.visual_verbal ?? DEFAULT_SLIDER));

  const explanation =
    row.explanation_style ??
    (analogies <= 40 || visual <= 40
      ? "example_first"
      : analogies >= 60
        ? "steps_first"
        : "example_first");

  const tone =
    row.feedback_tone ??
    (direct >= 60 ? "gentle" : direct <= 40 ? "blunt" : "gentle");

  const learned: LearnedPrefs = { ...(row.learned_prefs ?? {}) };
  if (learned.prefer_shorter == null && shortDeep <= 40) {
    learned.prefer_shorter = true;
  }
  if (learned.prefer_more_detail == null && shortDeep >= 60) {
    learned.prefer_more_detail = true;
  }
  if (learned.prefer_example == null && analogies <= 40) {
    learned.prefer_example = true;
  }

  let focus = row.focus_areas ?? [];
  if (focus.length === 0 && row.appe_baselines) {
    focus = focusFromBaselines(row.appe_baselines);
  }

  return {
    daily_minutes: row.daily_minutes ?? DEFAULT_DAILY_MINUTES,
    focus_areas: focus.slice(0, 2),
    explanation_style: explanation,
    feedback_tone: tone,
    learned_prefs: learned,
  };
}

export function focusFromBaselines(baselines: AppeBaselines): FocusArea[] {
  const scored: { area: FocusArea; score: number }[] = [];
  const add = (area: FocusArea, keys: AppeItemKey[]) => {
    const vals = keys
      .map((k) => baselines[k])
      .filter((n): n is number => typeof n === "number");
    if (!vals.length) return;
    scored.push({
      area,
      score: vals.reduce((a, b) => a + b, 0) / vals.length,
    });
  };
  add("presenting", [
    "presentation_a",
    "presentation_b",
    "presentation_c",
  ]);
  add("commenting", ["commentary", "response_to_commentary"]);
  add("answering_judges", ["response_to_judges"]);
  scored.sort((a, b) => a.score - b.score || a.area.localeCompare(b.area));
  const out: FocusArea[] = [];
  for (const s of scored) {
    if (out.includes(s.area)) continue;
    out.push(s.area);
    if (out.length >= 2) break;
  }
  return out;
}

export function focusLabel(area: FocusArea): string {
  return FOCUS_AREA_OPTIONS.find((o) => o.value === area)?.label ?? area;
}

export function tailoredLineParts(profile: LearningProfile | null | undefined): {
  minutes: string | null;
  focus: string | null;
  explanation: string | null;
  tone: string | null;
} {
  if (!profile) {
    return { minutes: null, focus: null, explanation: null, tone: null };
  }
  const minutes =
    profile.daily_minutes != null
      ? `${profile.daily_minutes} minutes a day`
      : null;
  const focus =
    profile.focus_areas[0] === "answering_judges"
      ? "judges' questions first"
      : profile.focus_areas[0] === "presenting"
        ? "presenting first"
        : profile.focus_areas[0] === "commenting"
          ? "commentary first"
          : profile.focus_areas[0] === "thinking_on_feet"
            ? "thinking on your feet first"
            : null;
  const explanation =
    profile.learned_prefs.prefer_example ||
    profile.explanation_style === "example_first"
      ? "examples first"
      : profile.explanation_style === "steps_first"
        ? "steps first"
        : null;
  const tone =
    profile.feedback_tone === "blunt"
      ? "blunt feedback"
      : profile.feedback_tone === "gentle"
        ? "gentle feedback"
        : null;
  return { minutes, focus, explanation, tone };
}

export function formatTailoredLine(
  profile: LearningProfile | null | undefined,
): string | null {
  const p = tailoredLineParts(profile);
  const bits = [p.minutes, p.focus, p.explanation].filter(Boolean);
  if (!bits.length) return null;
  return `Tailored to you: ${bits.join(", ")}`;
}
