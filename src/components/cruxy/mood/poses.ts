/**
 * Wave 7 G: the ten Cruxy poses in public/cruxy.
 * Real asset size is 273 by 557. "thinking" maps to neutral (no separate PNG).
 */
export type CruxyPose =
  | "curious"
  | "thinking"
  | "neutral"
  | "winking"
  | "happy"
  | "excited"
  | "surprised"
  | "sad"
  | "sleepy"
  | "angry";

export const POSE_WIDTH = 273;
export const POSE_HEIGHT = 557;
/** height / width for layout boxes that keep real proportions */
export const POSE_ASPECT = POSE_HEIGHT / POSE_WIDTH;

/** One Genie figure size everywhere (Wave 8 J). Never larger. */
export const GENIE_FIGURE_DESKTOP = 150;
export const GENIE_FIGURE_PHONE = 96;

/** Floating / popped-out Genie width for the current viewport. */
export function genieFigureWidth(viewportWidth: number): number {
  return viewportWidth < 640 ? GENIE_FIGURE_PHONE : GENIE_FIGURE_DESKTOP;
}

const FILE: Record<Exclude<CruxyPose, "thinking">, string> = {
  curious: "/cruxy/cruxy-curious.png",
  neutral: "/cruxy/cruxy-neutral.png",
  winking: "/cruxy/cruxy-winking.png",
  happy: "/cruxy/cruxy-happy.png",
  excited: "/cruxy/cruxy-excited.png",
  surprised: "/cruxy/cruxy-surprised.png",
  sad: "/cruxy/cruxy-sad.png",
  sleepy: "/cruxy/cruxy-sleepy.png",
  angry: "/cruxy/cruxy-angry.png",
};

/** Resolve a pose name to its PNG path. thinking → neutral. */
export function poseSrc(pose: CruxyPose | string): string {
  if (pose === "thinking") return FILE.neutral;
  if (pose in FILE) return FILE[pose as keyof typeof FILE];
  return FILE.curious;
}

export const ALL_POSE_SRCS: string[] = [
  ...Object.values(FILE),
  "/cruxy/cruxy-lamp.png",
];

/** Soft-cycle while a page or Cruxy answer loads. */
export const LOADING_CYCLE: CruxyPose[] = [
  "curious",
  "thinking",
  "excited",
  "winking",
];

export const POSE_LABEL: Record<CruxyPose, string> = {
  curious: "curious",
  thinking: "thinking",
  neutral: "listening",
  winking: "hint",
  happy: "pleased",
  excited: "excited",
  surprised: "surprised",
  sad: "sad",
  sleepy: "sleepy",
  angry: "fierce",
};

let preloaded = false;

/** Preload every pose once (browser Image). Safe to call many times. */
export function preloadCruxyPoses(): void {
  if (typeof window === "undefined" || preloaded) return;
  preloaded = true;
  for (const src of ALL_POSE_SRCS) {
    const img = new window.Image();
    img.decoding = "async";
    img.src = src;
  }
}
