import { NextResponse } from "next/server";
import { getPersonById, listTeams } from "@/lib/db/repository";
import { requireSession } from "@/lib/revision/api-auth";
import {
  getRoadmapView,
  listCasesAndTeams,
  recordJudgeAttempt,
  recordMapReview,
  recordPracticeSpeak,
  recordReadingProgress,
  studyingLabels,
} from "@/lib/revision/repository";
import { listAssignments } from "@/lib/team/repository";
import { appToday } from "@/lib/time/app-day";

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const [view, person, teams, meta, labels, assignments] = await Promise.all([
    getRoadmapView(auth.session.personId),
    getPersonById(auth.session.personId),
    listTeams(),
    listCasesAndTeams(),
    studyingLabels(auth.session.personId),
    listAssignments({ personId: auth.session.personId }).catch(() => []),
  ]);

  const team = teams.find((t) => t.id === (person?.team_id ?? auth.session.teamId));
  const rolesByCase = new Map<string, string>();
  for (const r of meta.case_roles ?? []) {
    if (r.person_id !== auth.session.personId) continue;
    const label =
      r.role === "lead_1"
        ? "Lead 1"
        : r.role === "lead_2"
          ? "Lead 2"
          : r.role === "counter_arguer"
            ? "Counter-arguer"
            : r.role === "supporter"
              ? "Supporter"
              : r.role;
    rolesByCase.set(r.case_id, label);
  }

  const today = appToday();
  let overdueCount = 0;
  const cases = view.cases.map((row) => {
    overdueCount += row.stages.filter(
      (s) => s.required && !s.done_at && s.due && s.due < today,
    ).length;
    const studying = labels.find((l) =>
      l.includes(`Case ${row.case.number}`),
    );
    return {
      ...row,
      role: rolesByCase.get(row.case.id) ?? undefined,
      tag: studying ?? undefined,
    };
  });

  const overallReady = cases.length
    ? Math.round(cases.reduce((s, c) => s + c.readiness, 0) / cases.length)
    : 0;

  const peopleById = new Map(
    (meta.people ?? []).map((p: { id: string; name: string }) => [p.id, p.name]),
  );

  const assignmentRows = assignments
    .filter((a) => a.status === "open")
    .map((a) => ({
      title: a.task,
      by: a.assigned_by
        ? `by ${peopleById.get(a.assigned_by) ?? "teammate"}`
        : "assigned to you",
      due: a.due,
      overdue: Boolean(a.due && a.due < today),
      accent: (a.due && a.due < today
        ? "overdue"
        : /redo/i.test(a.task)
          ? "redo"
          : "normal") as "overdue" | "redo" | "normal",
    }));

  return NextResponse.json({
    ...view,
    cases,
    personName: person?.name ?? auth.session.name,
    teamName: team?.name ?? null,
    overallReady,
    overdueCount,
    assignments: assignmentRows,
  });
}

export async function POST(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const body = (await req.json()) as {
    action: string;
    caseId?: string;
    teamId?: string;
    fileId?: string;
    openedRatio?: number;
    claimId?: string;
    score?: number;
  };

  if (body.action === "reading" && body.caseId && body.fileId) {
    await recordReadingProgress({
      personId: auth.session.personId,
      caseId: body.caseId,
      fileId: body.fileId,
      openedRatio: body.openedRatio ?? 0.7,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "map_review" && body.caseId && body.teamId) {
    await recordMapReview({
      personId: auth.session.personId,
      teamId: body.teamId,
      caseId: body.caseId,
      claimId: body.claimId,
      kind: body.claimId ? "reviewed" : "reviewed_all",
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "practiced" && body.caseId) {
    await recordPracticeSpeak({
      personId: auth.session.personId,
      caseId: body.caseId,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "judged" && body.caseId && body.score != null) {
    await recordJudgeAttempt({
      personId: auth.session.personId,
      caseId: body.caseId,
      score: body.score,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
