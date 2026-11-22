/**
 * Wave 9 E: solo async prep helpers (my part, minutes sessions).
 * Pure logic so Today (G) can import without server-only.
 */
import type { CaseRoleSlot } from "@/lib/team/types";

export type SoloPartId =
  | "presentation"
  | "commentary"
  | "response"
  | "judges";

export const SOLO_PART_LABELS: Record<SoloPartId, string> = {
  presentation: "Presentation",
  commentary: "Commentary",
  response: "Response to commentary",
  judges: "Judges' answers",
};

/** Suggested minutes for each part by role (prep, not stage time). */
export const PART_MINUTES_BY_ROLE: Record<
  CaseRoleSlot,
  Record<SoloPartId, number>
> = {
  lead_1: {
    presentation: 20,
    commentary: 10,
    response: 10,
    judges: 15,
  },
  lead_2: {
    presentation: 20,
    commentary: 10,
    response: 10,
    judges: 15,
  },
  counter_arguer: {
    presentation: 15,
    commentary: 20,
    response: 15,
    judges: 15,
  },
  supporter: {
    presentation: 15,
    commentary: 10,
    response: 10,
    judges: 10,
  },
};

export type SoloPartRow = {
  caseId: string;
  caseNumber: number;
  caseTitle: string;
  role: CaseRoleSlot;
  part: SoloPartId;
  label: string;
  minutes: number;
  done: boolean;
  doneAt: string | null;
};

export type MinutesBudget = 10 | 20 | 45;

export type FocusBlock = {
  part: SoloPartId;
  caseId: string;
  caseNumber: number;
  caseTitle: string;
  label: string;
  minutes: number;
  href: string;
  why: string;
};

/**
 * Build a focused session that fits the budget from unfinished parts.
 * Prefer one case at a time; fill remaining minutes with short drills.
 */
export function buildMinutesSession(input: {
  budget: MinutesBudget;
  parts: SoloPartRow[];
}): FocusBlock[] {
  const open = input.parts.filter((p) => !p.done);
  if (!open.length) return [];

  // Prefer the case with the most unfinished minutes
  const byCase = new Map<string, SoloPartRow[]>();
  for (const p of open) {
    const list = byCase.get(p.caseId) ?? [];
    list.push(p);
    byCase.set(p.caseId, list);
  }
  let bestCaseId = open[0]!.caseId;
  let bestWeight = 0;
  for (const [caseId, rows] of byCase) {
    const w = rows.reduce((s, r) => s + r.minutes, 0);
    if (w > bestWeight) {
      bestWeight = w;
      bestCaseId = caseId;
    }
  }

  const order: SoloPartId[] = [
    "presentation",
    "judges",
    "commentary",
    "response",
  ];
  const caseParts = (byCase.get(bestCaseId) ?? []).sort(
    (a, b) => order.indexOf(a.part) - order.indexOf(b.part),
  );

  const blocks: FocusBlock[] = [];
  let left = input.budget;
  for (const p of caseParts) {
    if (left < 5) break;
    const take = Math.min(p.minutes, left);
    blocks.push({
      part: p.part,
      caseId: p.caseId,
      caseNumber: p.caseNumber,
      caseTitle: p.caseTitle,
      label: `${p.label}, Case ${p.caseNumber}`,
      minutes: take,
      href: hrefForPart(p.part, p.caseId),
      why: `Your ${SOLO_PART_LABELS[p.part].toLowerCase()} on Case ${p.caseNumber} still needs work.`,
    });
    left -= take;
  }

  // If budget left and other cases open, add one short block
  if (left >= 8) {
    const other = open.find((p) => p.caseId !== bestCaseId);
    if (other) {
      const take = Math.min(other.minutes, left);
      blocks.push({
        part: other.part,
        caseId: other.caseId,
        caseNumber: other.caseNumber,
        caseTitle: other.caseTitle,
        label: `${other.label}, Case ${other.caseNumber}`,
        minutes: take,
        href: hrefForPart(other.part, other.caseId),
        why: `Also open on Case ${other.caseNumber}.`,
      });
    }
  }

  return blocks;
}

export function hrefForPart(part: SoloPartId, caseId: string): string {
  switch (part) {
    case "presentation":
      return `/practice/drills/thesis?caseId=${caseId}`;
    case "commentary":
      return `/practice/drills/commentary?caseId=${caseId}`;
    case "response":
      return `/practice/drills/commentary?caseId=${caseId}&mode=response`;
    case "judges":
      return `/practice/drills/judges-qa?caseId=${caseId}`;
    default:
      return `/prepare?caseId=${caseId}`;
  }
}

export function partsForRole(role: CaseRoleSlot): SoloPartId[] {
  // Every owner delivers all four round parts in prep; minutes differ by role.
  void role;
  return ["presentation", "commentary", "response", "judges"];
}
