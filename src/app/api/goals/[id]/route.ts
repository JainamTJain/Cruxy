import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getGoalById, updateGoal } from "@/lib/learning/goals";
import type { GoalStatus } from "@/lib/learning/growth-types";
import type { AppeItemKey } from "@/lib/practice/types";

export const runtime = "nodejs";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const existing = await getGoalById(id);
  if (!existing || existing.person_id !== session.personId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json()) as {
    title?: string;
    body?: string | null;
    status?: GoalStatus;
    targetAppeItem?: AppeItemKey | null;
  };
  try {
    const goal = await updateGoal({
      personId: session.personId,
      goalId: id,
      title: body.title,
      body: body.body,
      status: body.status,
      targetAppeItem: body.targetAppeItem,
    });
    return NextResponse.json({ ok: true, goal });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not update" },
      { status: 400 },
    );
  }
}
