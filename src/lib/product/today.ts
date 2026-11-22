/**
 * Wave 8 G: shape personal Today focus from program-map style payloads.
 * Pure helpers; no DB. Keep labels short and free of internal ids.
 */

export type TodayAction = {
  id: string;
  label: string;
  detail: string;
  href: string;
  kind: "join" | "warmup" | "drill" | "case" | "cards" | "other";
};

export type TodayWinStrip = {
  daysLeft: number | null;
  competitionLabel: string | null;
  leadCase: { id: string; number: number; title: string } | null;
  nextDrillHref: string;
};

type RawAction = { label: string; detail: string; href: string };

function kindOf(a: RawAction): TodayAction["kind"] {
  const h = a.href.toLowerCase();
  const l = a.label.toUpperCase();
  if (l === "JOIN" || l === "INVITE" || h.includes("/practice/")) return "join";
  if (h.includes("warmup")) return "warmup";
  if (h.includes("judges-qa") || h.includes("flashcards")) {
    return h.includes("flashcards") ? "cards" : "drill";
  }
  if (h.includes("case-brain")) return "case";
  return "other";
}

/** Dedup by href; prefer join actions; cap at three. */
export function buildFocusActions(
  raw: RawAction[],
  extras: RawAction[] = [],
): TodayAction[] {
  const merged = [...raw, ...extras];
  const seen = new Set<string>();
  const out: TodayAction[] = [];
  for (const a of merged) {
    const key = a.href.split("?")[0] ?? a.href;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `${out.length}-${key}`,
      label: a.label,
      detail: a.detail,
      href: a.href,
      kind: kindOf(a),
    });
    if (out.length >= 3) break;
  }
  return out;
}

export const DEC5_HELPERS = [
  {
    id: "warmup",
    label: "10-minute warm-up",
    detail: "Five cards, two questions, one rebuttal.",
    href: "/revision/warmup",
  },
  {
    id: "judges",
    label: "Judges' Q&A",
    detail: "One tap. Rapid follow-ups from Cruxy.",
    href: "/practice/drills/judges-qa",
  },
  {
    id: "cards",
    label: "Flashcards",
    detail: "Due cards only. Against your own past.",
    href: "/revision/flashcards",
  },
] as const;
