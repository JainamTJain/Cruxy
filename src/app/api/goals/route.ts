import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import {
  createGoal,
  listCommentsForGoals,
  listGoalsForPerson,
} from "@/lib/learning/goals";
import type { AppeItemKey } from "@/lib/practice/types";
import { isAdminViewer } from "@/lib/ops/privacy-scope";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const subjectId = url.searchParams.get("personId") ?? session.personId;
  const me = await getPersonById(session.personId);
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (subjectId !== session.personId && !isAdminViewer(me, session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const goals = await listGoalsForPerson(subjectId);
  const comments = await listCommentsForGoals(goals.map((g) => g.id));
  return NextResponse.json({
    goals: goals.map((g) => ({
      ...g,
      comments: comments.filter((c) => c.goal_id === g.id),
    })),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    title?: string;
    body?: string | null;
    targetAppeItem?: AppeItemKey | null;
  };
  try {
    const goal = await createGoal({
      personId: session.personId,
      title: body.title ?? "",
      body: body.body,
      targetAppeItem: body.targetAppeItem,
    });
    return NextResponse.json({ ok: true, goal });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save" },
      { status: 400 },
    );
  }
}
