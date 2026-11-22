/**
 * Stable per-person highlight colours for the reading tools.
 * Soft pastels so text stays readable.
 */

export const HIGHLIGHT_PALETTE = [
  { bg: "#FFE58A", border: "#E6C200", label: "gold" },
  { bg: "#C8E6C9", border: "#66BB6A", label: "green" },
  { bg: "#BBDEFB", border: "#42A5F5", label: "blue" },
  { bg: "#F8BBD0", border: "#EC407A", label: "pink" },
  { bg: "#D1C4E9", border: "#7E57C2", label: "violet" },
  { bg: "#FFCCBC", border: "#FF7043", label: "peach" },
  { bg: "#B2EBF2", border: "#26C6DA", label: "teal" },
  { bg: "#E6EE9C", border: "#C0CA33", label: "lime" },
] as const;

export type HighlightSwatch = (typeof HIGHLIGHT_PALETTE)[number];

function hashKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Pick a swatch from a person id or display name. */
export function colorForPerson(key: string | null | undefined): HighlightSwatch {
  if (!key) return HIGHLIGHT_PALETTE[0]!;
  return HIGHLIGHT_PALETTE[hashKey(key) % HIGHLIGHT_PALETTE.length]!;
}

export function formatWhen(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 36) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  try {
    return new Date(t).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}
