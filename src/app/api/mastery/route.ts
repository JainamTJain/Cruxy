import { NextResponse } from "next/server";
import { getPersonById, listTeams } from "@/lib/db/repository";
import { requireSession } from "@/lib/revision/api-auth";
import {
  getMasteryMap,
  listMasteryCases,
  resolveMasteryAccess,
} from "@/lib/mastery/repository";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const person = await getPersonById(auth.session.personId);
  if (!person) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await resolveMasteryAccess({
    personId: person.id,
    role: person.role,
    adminView: auth.session.adminView,
    teamId: person.team_id ?? auth.session.teamId,
  });

  const url = new URL(req.url);
  const caseId = url.searchParams.get("caseId");
  const teamIdParam = url.searchParams.get("teamId");

  const cases = await listMasteryCases(access);
  if (!caseId) {
    const teams = access.scope === "admin" ? await listTeams() : [];
    return NextResponse.json({
      access: access.scope,
      cases,
      teams: teams.map((t) => ({ id: t.id, name: t.name, colour: t.colour })),
    });
  }

  if (access.scope === "lead" && !access.caseIds.includes(caseId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId =
    access.scope === "admin"
      ? teamIdParam
      : access.scope === "lead"
        ? access.teamId
        : person.team_id;

  const map = await getMasteryMap({
    caseId,
    teamId,
    access,
  });

  return NextResponse.json({ access: access.scope, cases, map });
}
