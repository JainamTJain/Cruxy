/** Wave 9 I: display and motion prefs saved per person. */

export const TEXT_SIZE_STEPS = ["sm", "md", "lg", "xl"] as const;
export type TextSizeStep = (typeof TEXT_SIZE_STEPS)[number];

export const REDUCE_MOTION_MODES = ["system", "on", "off"] as const;
export type ReduceMotionMode = (typeof REDUCE_MOTION_MODES)[number];

export type AccessPrefs = {
  text_size: TextSizeStep;
  high_contrast: boolean;
  readable_font: boolean;
  reduce_motion: ReduceMotionMode;
};

export const DEFAULT_ACCESS_PREFS: AccessPrefs = {
  text_size: "md",
  high_contrast: false,
  readable_font: false,
  reduce_motion: "system",
};

export function isTextSizeStep(v: unknown): v is TextSizeStep {
  return TEXT_SIZE_STEPS.includes(v as TextSizeStep);
}

export function isReduceMotionMode(v: unknown): v is ReduceMotionMode {
  return REDUCE_MOTION_MODES.includes(v as ReduceMotionMode);
}

export function normalizeAccessPrefs(
  raw: Partial<AccessPrefs> | null | undefined,
): AccessPrefs {
  return {
    text_size: isTextSizeStep(raw?.text_size)
      ? raw!.text_size
      : DEFAULT_ACCESS_PREFS.text_size,
    high_contrast: Boolean(raw?.high_contrast),
    readable_font: Boolean(raw?.readable_font),
    reduce_motion: isReduceMotionMode(raw?.reduce_motion)
      ? raw!.reduce_motion
      : DEFAULT_ACCESS_PREFS.reduce_motion,
  };
}
