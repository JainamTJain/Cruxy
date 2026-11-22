/**
 * Colour is never the only signal (Wave 9 I).
 * Pair every team colour / status colour with a plain text label.
 */

export type StatusTone = "ok" | "warn" | "risk" | "neutral" | "info";

export const STATUS_LABEL: Record<StatusTone, string> = {
  ok: "On track",
  warn: "Needs attention",
  risk: "At risk",
  neutral: "Not set",
  info: "Info",
};

export function teamLabelWithColour(input: {
  name: string;
  colour?: string | null;
}): { label: string; colour: string | null } {
  return {
    label: input.name,
    colour: input.colour ?? null,
  };
}
