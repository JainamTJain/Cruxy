import { NextResponse } from "next/server";
import { getPersonById } from "@/lib/db/repository";
import { requireSession } from "@/lib/revision/api-auth";
import {
  getEnrichedRoadmapView,
  setTeamDeadlineOverrides,
  type DeadlineOverride,
} from "@/lib/revision/roadmap-extra";
import type { RoadmapStageId } from "@/lib/revision/types";
import { ROADMAP_STAGES } from "@/lib/revision/types";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const person = await getPersonById(auth.session.personId);
  const view = await getEnrichedRoadmapView({
    personId: auth.session.personId,
    name: person?.name ?? auth.session.name,
    teamId: person?.team_id ?? auth.session.teamId,
  });
  return NextResponse.json(view);
}

export async function POST(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const body = (await req.json()) as {
    action?: string;
    teamId?: string;
    dues?: Partial<Record<RoadmapStageId, string>>;
  };

  if (body.action === "set_deadlines") {
    const person = await getPersonById(auth.session.personId);
    const teamId = body.teamId ?? person?.team_id ?? auth.session.teamId;
    if (!teamId) {
      return NextResponse.json({ error: "No team" }, { status: 400 });
    }
    if (person?.team_id && person.team_id !== teamId && !auth.session.adminView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const dues: Partial<Record<RoadmapStageId, string>> = {};
    for (const stage of ROADMAP_STAGES) {
      const v = body.dues?.[stage];
      if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) dues[stage] = v;
    }
    const overrides: DeadlineOverride[] = await setTeamDeadlineOverrides({
      teamId,
      personId: auth.session.personId,
      dues,
    });
    return NextResponse.json({ overrides });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
