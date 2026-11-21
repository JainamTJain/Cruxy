import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canRead, canWrite } from "@/lib/admin/permissions";
import {
  addCompetitionLog,
  getPersonById,
  listCases,
  listCompetitionLogs,
  listCompetitions,
  listTeams,
  logActivity,
} from "@/lib/db/repository";
import { bankCompetitionQuestions } from "@/lib/db/supabase/admin-extra";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Competition log is readable by admins in admin view; members see via team space later
  if (!session.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canRead(person.role, "competition_log")) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const [logs, competitions, cases, teams] = await Promise.all([
    listCompetitionLogs(),
    listCompetitions(),
    listCases(),
    listTeams(),
  ]);
  return NextResponse.json({ logs, competitions, cases, teams });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canWrite(person.role, "competition_log")) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await req.json()) as {
    competition_id?: string;
    case_id?: string | null;
    case_number?: number | null;
    opponent?: string;
    moderator_question?: string | null;
    judges_questions?: string | null;
    judge_comments?: string | null;
    score_us?: number | null;
    score_them?: number | null;
    result?: "win" | "loss" | "tie" | "pending" | null;
    team_id?: string | null;
  };

  if (!body.competition_id || !body.opponent?.trim()) {
    return NextResponse.json(
      { error: "competition_id and opponent required" },
      { status: 400 },
    );
  }

  const row = await addCompetitionLog({
    competition_id: body.competition_id,
    case_id: body.case_id ?? null,
    case_number: body.case_number ?? null,
    opponent: body.opponent.trim(),
    moderator_question: body.moderator_question ?? null,
    judges_questions: body.judges_questions ?? null,
    judge_comments: body.judge_comments ?? null,
    score_us: body.score_us ?? null,
    score_them: body.score_them ?? null,
    result: body.result ?? "pending",
    team_id: body.team_id ?? null,
    created_by: person.id,
  });

  if (body.moderator_question || body.judges_questions) {
    await bankCompetitionQuestions({
      actorId: person.id,
      caseId: body.case_id ?? null,
      moderatorQuestion: body.moderator_question,
      judgesQuestions: body.judges_questions,
      logId: row.id,
    });
  }

  await logActivity({
    person_id: person.id,
    action: "competition_log_added",
    target: row.id,
    meta: { opponent: row.opponent },
  });

  return NextResponse.json({ ok: true, entry: row });
}
