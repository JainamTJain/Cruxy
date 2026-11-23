import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import { getReport, getRoundById } from "@/lib/db/practice-repository";
import { getReportExtras } from "@/lib/db/supabase/practice-extra";
import { isAdminRole } from "@/lib/admin/permissions";
import {
  isAdminViewer,
  redactPredictions,
} from "@/lib/ops/privacy-scope";
import { filterCitedFeedback } from "@/lib/practice/feedback";
import { filterDisplayableScores } from "@/lib/practice/appe-card";
import { getCalibratedJudgeForReport } from "@/lib/practice/calibrated-judge";
import {
  classifyReportStatus,
  reportStatusCopy,
} from "@/lib/practice/report-status";

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

  const me = await getPersonById(session.personId);
  const tech = session.adminView && session.role === "tech_admin";
  const admin = isAdminViewer(me, session);
  const coachOrTech = Boolean(me && isAdminRole(me.role));

  // Teams never see each other's work. Admins (coach/tech in admin view) see all.
  const onRound =
    session.teamId != null && round.team_ids.includes(session.teamId);
  if (!admin && !coachOrTech && !onRound) {
    return NextResponse.json(
      { error: "This report belongs to another team." },
      { status: 403 },
    );
  }

  const data = await getReport(id);
  const status = classifyReportStatus({
    round,
    reportHeadline: data.report?.headline,
    lines: data.lines,
    cards: data.cards,
  });
  const statusCopy = reportStatusCopy(status);

  const extras = await getReportExtras(id);
  const feedback = filterCitedFeedback(data.feedback, data.lines);
  const scores = data.scores.filter((s) => {
    const card = data.cards.find((c) => c.id === s.card_id);
    if (!card?.cruxy) return true;
    return filterDisplayableScores([s], true).length > 0;
  });

  // Redos are personal: keep own (and unclaimed stubs); admins see all.
  const redos = admin
    ? data.redos
    : data.redos.filter(
        (r) =>
          r.person_id === session.personId || r.person_id === "unknown",
      );
  const calibrated = await getCalibratedJudgeForReport(id);

  return NextResponse.json({
    round,
    report: data.report,
    status,
    statusCopy,
    feedback,
    redos,
    cards: data.cards.map((c) => {
      const redacted = redactPredictions(c, {
        viewerPersonId: session.personId,
        adminViewer: admin,
        coachOrTech,
      });
      return {
        ...redacted,
        calibration_note: tech ? c.calibration_note : undefined,
        calibration_use: tech ? c.calibration_use : undefined,
      };
    }),
    scores,
    lines: data.lines,
    // Skill charts are personal progress (own past only).
    skills: admin
      ? extras.skills
      : extras.skills.filter((s) => s.person_id === session.personId),
    talk: extras.talk,
    bank: extras.bank,
    people: extras.people,
    teams: extras.teams,
    judges: extras.judges,
    calibrated,
  });
}
