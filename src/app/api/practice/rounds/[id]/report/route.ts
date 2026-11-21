import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getReport, getRoundById } from "@/lib/db/practice-repository";
import { filterCitedFeedback } from "@/lib/practice/feedback";
import { filterDisplayableScores } from "@/lib/practice/appe-card";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const round = await getRoundById(id);
  if (!round) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data = await getReport(id);
  const feedback = filterCitedFeedback(data.feedback, data.lines);
  const scores = data.scores.filter((s) => {
    const card = data.cards.find((c) => c.id === s.card_id);
    if (!card?.cruxy) return true;
    return filterDisplayableScores([s], true).length > 0;
  });

  const tech =
    session.adminView && session.role === "tech_admin";

  return NextResponse.json({
    round,
    report: data.report,
    feedback,
    redos: data.redos,
    cards: data.cards.map((c) => ({
      ...c,
      calibration_note: tech ? c.calibration_note : undefined,
      calibration_use: tech ? c.calibration_use : undefined,
    })),
    scores,
    lines: data.lines,
  });
}
