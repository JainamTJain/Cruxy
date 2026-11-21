import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  answerAlignment,
  listPendingAlignmentForPerson,
} from "@/lib/team/repository";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const pending = await listPendingAlignmentForPerson(session.personId);
  return NextResponse.json({ pending });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    questionSetId?: string;
    answers?: string[];
  };
  if (!body.questionSetId || !body.answers?.length) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  try {
    const result = await answerAlignment({
      questionSetId: body.questionSetId,
      answers: body.answers,
      personId: session.personId,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 400 },
    );
  }
}
