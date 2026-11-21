import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
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
  if (redo.person_id !== session.personId && redo.person_id !== "unknown") {
    // Allow own redos; unknown stub speakers can be claimed by current user in sample
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

  return NextResponse.json({ redo: next, skills: updated, improved });
}
