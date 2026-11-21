import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { recordAdviceOutcome } from "@/lib/cruxy/outcomes";
import {
  getRedo,
  getSkillChart,
  saveRedo,
  saveSkillChart,
} from "@/lib/db/practice-repository";
import { updateSkillsAfterRedo } from "@/lib/practice/feedback";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const redo = await getRedo(id);
  if (!redo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Personal redo scores: only the owner (or an unclaimed stub) may update.
  if (redo.person_id !== session.personId && redo.person_id !== "unknown") {
    return NextResponse.json(
      { error: "That redo belongs to someone else." },
      { status: 403 },
    );
  }

  const body = (await req.json()) as { scoreAfter?: number };
  const scoreAfter = body.scoreAfter ?? (redo.score_before ?? 6) + 1;
  const improved =
    redo.score_before == null || scoreAfter > redo.score_before;

  const next = {
    ...redo,
    score_after: scoreAfter,
    open: !improved,
    person_id:
      redo.person_id === "unknown" ? session.personId : redo.person_id,
  };
  await saveRedo(next);

  const chart = await getSkillChart(session.personId);
  const updated = updateSkillsAfterRedo(chart, session.personId, improved);
  await saveSkillChart(updated);

  // F-357: outcomes grade Cruxy against the next score after advice.
  try {
    await recordAdviceOutcome({
      personId: next.person_id,
      agent: "judge",
      feedbackId: next.feedback_item_id,
      adviceRef: next.id,
      scoreBefore: next.score_before,
      scoreAfter: next.score_after,
      followed: true,
      judgeAgreed: improved,
      note: improved
        ? "Redo score rose after Cruxy advice."
        : "Redo score did not rise after Cruxy advice.",
      createdBy: session.personId,
    });
  } catch {
    /* outcomes table may not be applied yet locally */
  }

  return NextResponse.json({ redo: next, skills: updated, improved });
}
