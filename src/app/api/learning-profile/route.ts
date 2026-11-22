import { NextResponse } from "next/server";
import { getSession, updateSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import {
  getLearningProfile,
  upsertLearningProfile,
} from "@/lib/learning/profile";
import {
  DEFAULT_DAILY_MINUTES,
  formatTailoredLine,
  parseDailyMinutes,
  parseExplanationStyle,
  parseFeedbackTone,
  parseFocusAreas,
  type DailyMinutes,
  type ExplanationStyle,
  type FeedbackTone,
  type FocusArea,
} from "@/lib/learning/types";
import { isAdminViewer } from "@/lib/ops/privacy-scope";

export const runtime = "nodejs";

/** Personal learning profile. Self only (or admin viewer for coaching). */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const subjectId = url.searchParams.get("personId") ?? session.personId;
  const me = await getPersonById(session.personId);
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (subjectId !== session.personId && !isAdminViewer(me, session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const profile = await getLearningProfile(subjectId);
  return NextResponse.json({
    profile,
    tailored: formatTailoredLine(profile),
    defaults: {
      dailyMinutes: DEFAULT_DAILY_MINUTES,
      focusAreas: [] as FocusArea[],
      explanationStyle: "example_first" as ExplanationStyle,
      feedbackTone: "gentle" as FeedbackTone,
    },
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    dailyMinutes?: number | null;
    focusAreas?: string[];
    explanationStyle?: string | null;
    feedbackTone?: string | null;
    skip?: boolean;
    // Legacy Wave 8 body (still accepted and migrated).
    sliders?: Record<string, number>;
    appeBaselines?: Record<string, number>;
  };

  const skip = Boolean(body.skip);
  const dailyMinutes = parseDailyMinutes(body.dailyMinutes);
  const focusAreas = parseFocusAreas(body.focusAreas);
  const explanationStyle = parseExplanationStyle(body.explanationStyle);
  const feedbackTone = parseFeedbackTone(body.feedbackTone);

  if (!skip && !body.sliders) {
    // Partial saves are fine; empty skip-only saves still complete.
  }

  const profile = await upsertLearningProfile({
    personId: session.personId,
    dailyMinutes: skip
      ? (dailyMinutes ?? DEFAULT_DAILY_MINUTES)
      : (dailyMinutes as DailyMinutes | null | undefined),
    focusAreas,
    explanationStyle,
    feedbackTone,
    markComplete: true,
    sliders: body.sliders,
    appeBaselines: body.appeBaselines,
  });
  await updateSession({ mustSetLearningProfile: false });
  return NextResponse.json({
    ok: true,
    profile,
    tailored: formatTailoredLine(profile),
  });
}
