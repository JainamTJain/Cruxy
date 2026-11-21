import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canWrite } from "@/lib/admin/permissions";
import { getPersonById } from "@/lib/db/repository";
import { setTeamMembership } from "@/lib/db/supabase/auth-extra";

export const runtime = "nodejs";

/** Admin: move a person between teams, or clear their team. */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const actor = await getPersonById(session.personId);
  if (!actor || !canWrite(actor.role, "teams_people")) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await req.json()) as {
    personId?: string;
    teamId?: string | null;
  };
  if (!body.personId) {
    return NextResponse.json({ error: "personId required" }, { status: 400 });
  }

  const target = await getPersonById(body.personId);
  if (!target) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }
  if (target.role === "tech_admin" || target.role === "coach_admin") {
    return NextResponse.json(
      { error: "Admins stay off the team roster." },
      { status: 400 },
    );
  }

  const updated = await setTeamMembership({
    actorId: actor.id,
    personId: body.personId,
    teamId: body.teamId === undefined ? null : body.teamId,
  });

  return NextResponse.json({
    ok: true,
    person: {
      id: updated.id,
      name: updated.name,
      team_id: updated.team_id,
    },
  });
}
