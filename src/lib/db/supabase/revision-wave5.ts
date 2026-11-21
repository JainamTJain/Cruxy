import "server-only";
import { randomUUID } from "crypto";
import { assertOk, getServiceSupabase } from "@/lib/db/supabase/client";
import { runModerator } from "@/lib/cruxy/agents/moderator";
import { iso, type Row } from "@/lib/db/supabase/util";
import { logActivity } from "@/lib/db/repository";
import type {
  ModeratorQuestion,
  QuestionAnswer,
  QuestionOrigin,
} from "@/lib/revision/types";
import { nowIso } from "@/lib/utils";

function must<T>(
  res: { data: T; error: { message: string } | null },
  ctx: string,
): T {
  assertOk(res.error, ctx);
  return res.data;
}

function mapAnswer(r: Row): QuestionAnswer {
  return {
    id: r.id,
    question_id: r.question_id,
    person_id: r.person_id,
    team_id: r.team_id ?? null,
    text: r.text,
    mode: r.mode ?? "typed",
    transcript_ref: r.transcript_ref ?? null,
    score: r.score ?? null,
    feedback: r.feedback ?? null,
    created_at: iso(r.created_at),
    created_by: r.created_by ?? null,
  };
}

export async function deletePhrasebookEntry(
  personId: string,
  entryId: string,
): Promise<void> {
  const sb = getServiceSupabase();
  assertOk(
    (
      await sb
        .from("phrasebook_entries")
        .delete()
        .eq("id", entryId)
        .eq("person_id", personId)
    ).error,
    "deletePhrasebookEntry",
  );
}

export async function listAnswersForQuestion(
  questionId: string,
  teamId?: string,
): Promise<QuestionAnswer[]> {
  const sb = getServiceSupabase();
  let q = sb
    .from("answers")
    .select("*")
    .eq("question_id", questionId)
    .order("created_at", { ascending: true });
  if (teamId) q = q.eq("team_id", teamId);
  const rows = must(await q, "listAnswersForQuestion") ?? [];
  return rows.map(mapAnswer);
}

export type RobustnessMemberRow = {
  person_id: string;
  person_name: string;
  improved_count: number;
  bank_size: number;
  share: number;
};

export async function robustnessMeterForCase(
  caseId: string,
  teamId: string,
): Promise<RobustnessMemberRow[]> {
  const sb = getServiceSupabase();
  const [questionsRes, membersRes, answersRes] = await Promise.all([
    sb.from("questions").select("id").eq("case_id", caseId).eq("status", "active"),
    sb.from("people").select("id,name").eq("team_id", teamId),
    sb
      .from("answers")
      .select("*")
      .eq("team_id", teamId)
      .order("created_at", { ascending: true }),
  ]);

  const questionIds = (must(questionsRes, "robustness.questions") ?? []).map(
    (r: Row) => r.id as string,
  );
  const members = must(membersRes, "robustness.members") ?? [];
  const answers = (must(answersRes, "robustness.answers") ?? []).map(mapAnswer);

  const bankSize = questionIds.length;
  if (bankSize === 0) {
    return members.map((m: Row) => ({
      person_id: m.id,
      person_name: m.name,
      improved_count: 0,
      bank_size: 0,
      share: 0,
    }));
  }

  const qSet = new Set(questionIds);

  return members.map((m: Row) => {
    const byQ = new Map<string, number[]>();
    for (const a of answers) {
      if (a.person_id !== m.id || !qSet.has(a.question_id)) continue;
      if (a.score == null) continue;
      const arr = byQ.get(a.question_id) ?? [];
      arr.push(a.score);
      byQ.set(a.question_id, arr);
    }

    let improved = 0;
    for (const scores of byQ.values()) {
      if (scores.length < 1) continue;
      const first = scores[0]!;
      const best = Math.max(...scores);
      if (best > first) improved += 1;
    }

    return {
      person_id: m.id,
      person_name: m.name,
      improved_count: improved,
      bank_size: bankSize,
      share: improved / bankSize,
    };
  });
}

export async function generateCruxyModeratorQuestions(args: {
  personId: string;
  teamId: string;
  caseId: string;
}): Promise<ModeratorQuestion[]> {
  const sb = getServiceSupabase();
  const [caseHit, claimRows] = await Promise.all([
    must(
      await sb
        .from("cases")
        .select("id,number,title")
        .eq("id", args.caseId)
        .maybeSingle(),
      "genMod.case",
    ),
    must(
      await sb
        .from("claims")
        .select("text")
        .eq("team_id", args.teamId)
        .eq("case_id", args.caseId)
        .order("ord", { ascending: true }),
      "genMod.claims",
    ),
  ]);

  const caseRow = caseHit as Row | null;
  if (!caseRow) throw new Error("case not found");

  const claims = claimRows ?? [];
  const summaries = claims.map((c: Row) => c.text as string);
  if (!summaries.length) {
    summaries.push("Team claim map not filled yet.");
  }

  const mod = await runModerator({
    caseNumber: caseRow.number as number,
    caseTitle: caseRow.title as string,
    claimSummaries: summaries,
    personId: args.personId,
  });

  const origin: QuestionOrigin = "cruxy";
  const origin_label = "Cruxy";

  const created: ModeratorQuestion[] = mod.questions.map((q) => ({
    id: randomUUID(),
    case_id: args.caseId,
    text: q.text,
    type: q.type,
    difficulty: Math.min(3, Math.max(1, q.difficulty)) as 1 | 2 | 3,
    origin,
    origin_label,
    status: "pending_confirm",
    asked_at_tag: q.type === "closing" ? "closing" : null,
    created_at: nowIso(),
    created_by: args.personId,
  }));

  if (created.length) {
    assertOk(
      (await sb.from("questions").insert(created)).error,
      "generateCruxyModeratorQuestions.insert",
    );
  }

  await logActivity({
    person_id: args.personId,
    action: "moderator_cruxy_generate",
    target: args.caseId,
    meta: { count: created.length, team_id: args.teamId },
  });

  return created;
}