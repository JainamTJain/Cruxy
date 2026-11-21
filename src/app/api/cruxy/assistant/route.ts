import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { askTeamAssistant } from "@/lib/team/assistant";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as {
    question?: string;
    caseId?: string | null;
    page?: string | null;
    highlight?: string | null;
    adminMode?: boolean;
  };
  if (!body.question?.trim()) {
    return NextResponse.json({ error: "Missing question" }, { status: 400 });
  }

  // Admin mode only for admins in admin view
  const adminMode =
    Boolean(body.adminMode) &&
    session.adminView &&
    (session.role === "tech_admin" || session.role === "coach_admin");

  const reply = await askTeamAssistant(body.question.trim(), {
    personId: session.personId,
    teamId: session.teamId,
    caseId: body.caseId,
    page: body.page,
    highlight: body.highlight,
    adminMode,
  });

  return NextResponse.json(reply);
}
