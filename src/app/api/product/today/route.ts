import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { GET as programMapGet } from "@/app/api/program-map/route";
import { getLearningProfile } from "@/lib/learning/profile";
import { formatTailoredLine, type FocusArea } from "@/lib/learning/types";
import {
  buildFocusActions,
  DEC5_HELPERS,
} from "@/lib/product/today";

export const runtime = "nodejs";
/** Today reuses program-map; keep headroom for that fan-out. */
export const maxDuration = 60;

function focusExtras(focus: FocusArea[], minutes: number | null) {
  const budget =
    minutes != null ? `Fits about ${minutes} minutes.` : "Fits a short block.";
  const out: { label: string; detail: string; href: string }[] = [];
  const want = new Set(focus);
  if (want.has("answering_judges") || want.size === 0) {
    out.push({
      label: "DRILL",
      detail: `Judges' Q&A. ${budget}`,
      href: "/practice/drills/judges-qa",
    });
  }
  if (want.has("presenting")) {
    out.push({
      label: "DRILL",
      detail: `Thesis drill. ${budget}`,
      href: "/practice/drills/thesis",
    });
  }
  if (want.has("commenting")) {
    out.push({
      label: "DRILL",
      detail: `Commentary drill. ${budget}`,
      href: "/practice/drills/commentary",
    });
  }
  if (want.has("thinking_on_feet")) {
    out.push({
      label: "DRILL",
      detail: `Moderator questions. ${budget}`,
      href: "/practice/drills/moderator",
    });
  }
  if (minutes != null && minutes <= 10) {
    out.unshift({
      label: "WARM-UP",
      detail: "Ten-minute warm-up. Five cards, two questions.",
      href: "/revision/warmup",
    });
  } else {
    out.push({
      label: "WARM-UP",
      detail: DEC5_HELPERS[0]!.detail,
      href: DEC5_HELPERS[0]!.href,
    });
  }
  return out;
}

/**
 * Personal Today payload for Wave 8 G.
 * Reuses program-map; sizes actions from the learning profile.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  // Program map and the learning profile are independent.
  const [programRes, profile] = await Promise.all([
    programMapGet(),
    getLearningProfile(session.personId),
  ]);
  if (!programRes.ok) {
    return NextResponse.json(
      { error: "Could not load Today" },
      { status: programRes.status },
    );
  }

  const map = (await programRes.json()) as {
    nextActions?: { label: string; detail: string; href: string }[] | string[];
    todaySessions?: {
      sessionId: string;
      title: string;
      href: string;
      caseNumber: number | null;
      invitePending?: boolean;
    }[];
    daysToCompetition?: number | null;
    competition?: { name: string; date: string; place: string | null } | null;
    todayLabel?: string;
    cases?: { id: string; number: number; title: string }[];
  };

  const minutes = profile?.daily_minutes ?? null;
  const focus = profile?.focus_areas ?? [];

  const rawActions: { label: string; detail: string; href: string }[] = [];
  for (const a of map.nextActions ?? []) {
    if (typeof a === "string") {
      rawActions.push({
        label: "DO NEXT",
        detail: a,
        href: "/revision/roadmap",
      });
    } else {
      rawActions.push(a);
    }
  }

  const extras = focusExtras(focus, minutes);
  const actions = buildFocusActions(rawActions, extras);
  // Reuse cases already loaded by program-map; skip a second catalog round-trip.
  const allCases = map.cases ?? [];

  const sessionCaseNum = map.todaySessions?.find((s) => s.caseNumber != null)
    ?.caseNumber;
  const leadCase =
    (sessionCaseNum != null
      ? allCases.find((c) => c.number === sessionCaseNum)
      : null) ??
    allCases[0] ??
    null;

  const nextDrillHref =
    extras.find((e) => e.label === "DRILL")?.href ??
    "/practice/drills/judges-qa";

  return NextResponse.json({
    personName: session.name,
    todayLabel: map.todayLabel ?? null,
    daysToCompetition: map.daysToCompetition ?? null,
    competition: map.competition ?? null,
    todaySessions: map.todaySessions ?? [],
    actions,
    helpers: DEC5_HELPERS,
    leadCase: leadCase
      ? { id: leadCase.id, number: leadCase.number, title: leadCase.title }
      : null,
    nextDrillHref,
    tailored: formatTailoredLine(profile),
    dailyMinutes: minutes,
  });
}
