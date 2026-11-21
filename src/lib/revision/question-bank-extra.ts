import type { ModeratorQuestion, QuestionAnswer } from "@/lib/revision/types";
import type { Person } from "@/lib/types";

export function listAnswersForQuestionSample(
  answers: QuestionAnswer[],
  questionId: string,
  teamId?: string,
): QuestionAnswer[] {
  return answers
    .filter(
      (a) =>
        a.question_id === questionId &&
        (teamId ? a.team_id === teamId : true),
    )
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
}

export type RobustnessMemberRow = {
  person_id: string;
  person_name: string;
  improved_count: number;
  bank_size: number;
  share: number;
};

export function computeRobustnessFromStore(input: {
  questions: ModeratorQuestion[];
  answers: QuestionAnswer[];
  members: Person[];
  caseId: string;
  teamId: string;
}): RobustnessMemberRow[] {
  const questionIds = input.questions
    .filter((q) => q.case_id === input.caseId && q.status === "active")
    .map((q) => q.id);
  const bankSize = questionIds.length;
  const qSet = new Set(questionIds);
  const members = input.members.filter((m) => m.team_id === input.teamId);

  if (bankSize === 0) {
    return members.map((m) => ({
      person_id: m.id,
      person_name: m.name,
      improved_count: 0,
      bank_size: 0,
      share: 0,
    }));
  }

  return members.map((m) => {
    const byQ = new Map<string, number[]>();
    for (const a of input.answers) {
      if (a.person_id !== m.id || !qSet.has(a.question_id)) continue;
      if (a.score == null) continue;
      const arr = byQ.get(a.question_id) ?? [];
      arr.push(a.score);
      byQ.set(a.question_id, arr);
    }

    let improved = 0;
    for (const scores of byQ.values()) {
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