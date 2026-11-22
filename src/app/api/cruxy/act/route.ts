import { NextResponse } from "next/server";
import { canSetCaseRole } from "@/lib/auth/capabilities";
import { getSession } from "@/lib/auth/session";
import { planPageAction } from "@/lib/cruxy/actions/dispatch";
import { signPlan } from "@/lib/cruxy/actions/plan-token";
import { getPersonById } from "@/lib/db/repository";
import { askTeamAssistant } from "@/lib/team/assistant";
import { getRolesBoard } from "@/lib/team/roles-board-repository";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One door for Cruxy chat (drawer and floating): do something on this page when
 * asked, otherwise answer with sources. Actions come back as a preview to Apply.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    message?: string;
    page?: string | null;
    caseId?: string | null;
  };
  const message = body.message?.trim() ?? "";
  if (!message) {
    return NextResponse.json(
      { error: "Type a question or a request first." },
      { status: 400 },
    );
  }
  const page = body.page ?? "";

  try {
    const person = await getPersonById(session.personId);
    const teamId = person?.team_id ?? session.teamId;

    let rolesBoard = null;
    if (page.startsWith("/team/roles") && teamId && person) {
      rolesBoard = await getRolesBoard({
        teamId,
        canEdit: canSetCaseRole(person, session, teamId),
      });
    }

    const planned = await planPageAction({
      message,
      page,
      caseId: body.caseId ?? null,
      teamId,
      personId: session.personId,
      rolesBoard,
    });

    if (planned.kind === "say") {
      return NextResponse.json({
        kind: "answer",
        text: planned.text,
        citations: [],
      });
    }

    if (planned.kind === "plan") {
      const planId = await signPlan({
        action: planned.action,
        personId: session.personId,
        teamId: planned.teamId ?? teamId,
        data: planned.data,
      });
      return NextResponse.json({
        kind: "plan",
        planId,
        summary: planned.summary,
        lines: planned.lines,
      });
    }

    const reply = await askTeamAssistant(message, {
      personId: session.personId,
      teamId: session.teamId,
      caseId: body.caseId ?? null,
      page,
      highlight: null,
      adminMode: false,
    });
    return NextResponse.json({
      kind: "answer",
      text: reply.text,
      citations: reply.citations ?? [],
      wantsMoreAvailable: reply.wantsMoreAvailable ?? false,
      leanFlag: reply.leanFlag ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    return NextResponse.json(
      {
        error:
          msg && msg.length < 160
            ? msg
            : "Cruxy hit a problem. Try again, or tap Expand.",
      },
      { status: 500 },
    );
  }
}
