/**
 * APPE California Regional phase timings for the Competition Day timer.
 * Ranges from docs/domain/ethics-bowl.md; we use the hard-stop lengths
 * California teams should plan for unless the host publishes otherwise.
 */

export type AppePhaseKey =
  | "presentation"
  | "conferral"
  | "commentary"
  | "response"
  | "judges_qa";

export type AppePhase = {
  key: AppePhaseKey;
  label: string;
  /** Seconds until "that's time". */
  seconds: number;
  hint: string;
};

/** Official-ish California defaults (presentation 10, conferral 1, commentary 5, response 3, Q&A 10). */
export const APPE_DAY_PHASES: AppePhase[] = [
  {
    key: "presentation",
    label: "Presentation",
    seconds: 10 * 60,
    hint: "Presenting team. Hard stop at time.",
  },
  {
    key: "conferral",
    label: "Conferral",
    seconds: 60,
    hint: "One minute for the commenting team to confer.",
  },
  {
    key: "commentary",
    label: "Commentary",
    seconds: 5 * 60,
    hint: "Commenting team responds to the presentation.",
  },
  {
    key: "response",
    label: "Response",
    seconds: 3 * 60,
    hint: "Presenting team replies to commentary.",
  },
  {
    key: "judges_qa",
    label: "Judges' questions",
    seconds: 10 * 60,
    hint: "Judges ask; the team may confer before answering.",
  },
];

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}
