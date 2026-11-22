import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import { addGoalComment, getGoalById } from "@/lib/learning/goals";
import { isAdminViewer } from "@/lib/ops/privacy-scope";

export const runtime = "nodejs";

/** Dr. B / tech admin in admin view may comment on a person's goal. */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await getPersonById(session.personId);
  if (!me || !isAdminViewer(me, session)) {
    return NextResponse.json(
      { error: "Only Dr. B or Jainam can comment here." },
      { status: 403 },
    );
  }
  const { id } = await ctx.params;
  const goal = await getGoalById(id);
  if (!goal) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const body = (await req.json()) as { body?: string };
  try {
    const comment = await addGoalComment({
      goalId: id,
      authorId: session.personId,
      body: body.body ?? "",
    });
    return NextResponse.json({ ok: true, comment });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not comment" },
      { status: 400 },
    );
  }
}
