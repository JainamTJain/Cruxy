import { NextResponse } from "next/server";
import { canSetCaseRole } from "@/lib/auth/capabilities";
import { getSession } from "@/lib/auth/session";
import { readPlan } from "@/lib/cruxy/actions/plan-token";
import type { RolesPlanData } from "@/lib/cruxy/actions/roles";
import { getPersonById } from "@/lib/db/repository";
import { applyRolePlan } from "@/lib/team/roles-board-repository";

export const runtime = "nodejs";

/** Apply a plan Cruxy proposed, after the person tapped Apply. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { planId?: string };
  const plan = body.planId ? await readPlan<RolesPlanData>(body.planId) : null;
  if (!plan || plan.personId !== session.personId) {
    return NextResponse.json(
      { error: "That plan has expired. Ask Cruxy again and it will make a fresh one." },
      { status: 400 },
    );
  }

  if (plan.action === "roles.assign" && plan.teamId) {
    const person = await getPersonById(session.personId);
    if (!person || !canSetCaseRole(person, session, plan.teamId)) {
      return NextResponse.json(
        { error: "Only a case lead, Dr. B or Jainam can change roles for this team." },
        { status: 403 },
      );
    }
    try {
      await applyRolePlan({
        teamId: plan.teamId,
        actorId: session.personId,
        assignments: plan.data.assignments,
        replaceCases: plan.data.replace,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      return NextResponse.json(
        { error: msg || "That did not go through. Nothing was changed." },
        { status: 409 },
      );
    }
    return NextResponse.json({
      message: `Done. ${plan.data.assignments.length} roles are set, and everyone affected gets a notification.`,
    });
  }

  return NextResponse.json({ error: "I do not know how to apply that yet." }, { status: 400 });
}
