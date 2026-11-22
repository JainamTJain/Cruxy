/**
 * Today action: plan the next 20 minutes from the person's real focus list.
 */
import "server-only";

import { GET as programMapGet } from "@/app/api/program-map/route";
import {
  buildFocusActions,
  DEC5_HELPERS,
} from "@/lib/product/today";
import type { ActPlanResult } from "@/lib/cruxy/actions/types";

export type TodayPlan20Data = {
  steps: { label: string; detail: string; href: string; minutes: number }[];
};

export { looksLikeTodayPlan } from "@/lib/cruxy/actions/detect";

function helpersAsActions() {
  return DEC5_HELPERS.map((h) => ({
    label: h.id === "judges" ? "DRILL" : h.id === "warmup" ? "WARM-UP" : "CARDS",
    detail: h.detail,
    href: h.href,
  }));
}

export async function planToday20(): Promise<ActPlanResult> {
  const extras = helpersAsActions();
  let raw: { label: string; detail: string; href: string }[] = [];
  try {
    const programRes = await programMapGet();
    if (programRes.ok) {
      const map = (await programRes.json()) as {
        nextActions?:
          | { label: string; detail: string; href: string }[]
          | string[];
      };
      for (const a of map.nextActions ?? []) {
        if (typeof a === "string") {
          raw.push({
            label: "DO NEXT",
            detail: a,
            href: "/revision/roadmap",
          });
        } else {
          raw.push(a);
        }
      }
    }
  } catch {
    raw = [];
  }

  const actions = buildFocusActions(raw, extras);
  if (!actions.length) {
    // Should not happen: DEC5_HELPERS always fills extras.
    const fallback = buildFocusActions([], extras);
    return planFromSteps(fallback);
  }
  return planFromSteps(actions);
}

function planFromSteps(
  actions: { label: string; detail: string; href: string }[],
): ActPlanResult {
  const minutes = [8, 7, 5];
  const steps = actions.slice(0, 3).map((a, i) => ({
    label: a.label,
    detail: a.detail,
    href: a.href,
    minutes: minutes[i] ?? 5,
  }));
  const data: TodayPlan20Data = { steps };
  return {
    kind: "plan",
    action: "today.plan20",
    summary:
      "Here is a 20-minute plan from your real focus list. Tap Apply to open the first step.",
    lines: steps.map((s) => `${s.minutes} min: ${s.detail} (${s.label})`),
    data,
  };
}

export function applyTodayPlan(data: TodayPlan20Data): {
  message: string;
  navigate: string | null;
} {
  const first = data.steps[0];
  if (!first) {
    return {
      message: "No steps to open. Check Today for your focus cards.",
      navigate: "/today",
    };
  }
  return {
    message: `Start with: ${first.detail}`,
    navigate: first.href,
  };
}
