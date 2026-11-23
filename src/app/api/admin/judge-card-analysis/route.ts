import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canRead, canWrite } from "@/lib/admin/permissions";
import { getPersonById, listPeopleFull } from "@/lib/db/repository";
import {
  ensureRoundCardAnalyses,
  overrideCardAnalysis,
  techAdminRoundAnalyses,
} from "@/lib/practice/judge-card-analysis";
import { listCorrections } from "@/lib/db/supabase/judge-card-extra";
import { getJudgeGroundingPack } from "@/lib/practice/judge-grounding";
import { countHumanCards } from "@/lib/db/supabase/judge-card-extra";

export const runtime = "nodejs";
export const maxDuration = 180;

/**
 * F-265: technical admin sees card analysis, item uses, overrides, corrections.
 * Members never hit this route.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canRead(person.role, "calibration")) {
    return NextResponse.json(
      { error: "Calibration analysis is technical admin only." },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const roundId = url.searchParams.get("roundId");
  const humanCards = await countHumanCards();
  const grounding = await getJudgeGroundingPack();
  const corrections = await listCorrections();

  if (!roundId) {
    return NextResponse.json({
      humanCards,
      groundingSources: grounding.sources,
      corrections,
      analyses: [],
      empty: humanCards === 0,
      emptyMessage:
        humanCards === 0
          ? "No human judge cards yet. Cruxy is grounded in the APPE Guide to Scoring until real cards arrive."
          : "Open a round's calibration link to see each card's analysis. No invented scores.",
    });
  }

  await ensureRoundCardAnalyses({
    roundId,
    personId: session.personId,
    competingCheck: (judgePersonId) => {
      if (!judgePersonId) return false;
      // Competing-team check filled when we have round team membership.
      return false;
    },
  });

  const analyses = await techAdminRoundAnalyses(roundId);
  return NextResponse.json({
    humanCards,
    groundingSources: grounding.sources,
    corrections,
    analyses,
    empty: analyses.length === 0,
    emptyMessage:
      analyses.length === 0
        ? "No analysed human cards for this round yet."
        : null,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canWrite(person.role, "calibration")) {
    return NextResponse.json(
      { error: "Only the technical admin can override calibration." },
      { status: 403 },
    );
  }

  const body = (await req.json()) as {
    action?: string;
    cardId?: string;
    use?: "full" | "reduced" | "feedback_only";
    reason?: string;
    roundId?: string;
  };

  if (body.action === "override" && body.cardId && body.use) {
    const analysis = await overrideCardAnalysis({
      cardId: body.cardId,
      use: body.use,
      reason: body.reason ?? "",
      actorId: session.personId,
    });
    return NextResponse.json({ analysis });
  }

  if (body.action === "ensure" && body.roundId) {
    const people = await listPeopleFull();
    void people;
    const bundles = await ensureRoundCardAnalyses({
      roundId: body.roundId,
      personId: session.personId,
    });
    return NextResponse.json({ count: bundles.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
