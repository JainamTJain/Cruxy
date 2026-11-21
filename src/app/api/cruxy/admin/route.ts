import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canRead } from "@/lib/admin/permissions";
import { getPersonById } from "@/lib/db/repository";
import { answerAdminProgramQuestion } from "@/lib/cruxy/admin-mode";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canRead(person.role, "cruxy_admin")) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const body = (await req.json()) as { question?: string };
  if (!body.question?.trim()) {
    return NextResponse.json({ error: "Missing question" }, { status: 400 });
  }
  const answer = await answerAdminProgramQuestion({
    question: body.question.trim(),
    personId: person.id,
  });
  return NextResponse.json(answer);
}
