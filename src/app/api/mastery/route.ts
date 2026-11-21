import { NextResponse } from "next/server";
import { getPersonById, listTeams } from "@/lib/db/repository";
import {
  canViewMasteryMap,
  isAdminViewer,
} from "@/lib/ops/privacy-scope";
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
  // Only admins may filter by team. Never accept a client personId.
  const teamIdParam =
    access.scope === "admin" ? url.searchParams.get("teamId") : null;

  const cases = await listMasteryCases(access);
  if (!caseId) {
    const teams = access.scope === "admin" ? await listTeams() : [];
    return NextResponse.json({
      access: access.scope,
      cases,
      teams: teams.map((t) => ({ id: t.id, name: t.name, colour: t.colour })),
    });
  }

  if (access.scope === "none") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (access.scope === "lead" && !access.caseIds.includes(caseId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const teamId =
    access.scope === "admin"
      ? teamIdParam
      : access.scope === "lead" || access.scope === "self"
        ? access.teamId
        : person.team_id;

  // Privacy: every returned person must pass canViewMasteryMap
  const map = await getMasteryMap({
    caseId,
    teamId,
    access,
  });

  if (access.scope !== "admin" && teamId) {
    const allowed: typeof map.people = [];
    for (const p of map.people) {
      const ok = await canViewMasteryMap({
        viewer: person,
        session: auth.session,
        subjectPersonId: p.id,
        teamId,
        caseId,
      });
      if (ok) allowed.push(p);
    }
    if (allowed.length !== map.people.length) {
      const allowIds = new Set(allowed.map((p) => p.id));
      map.people = allowed;
      map.cells = map.cells.filter((c) => allowIds.has(c.person_id));
      map.emptyActivity = map.cells.every((c) => c.band === "empty");
    }
  } else if (access.scope === "admin" && !isAdminViewer(person, auth.session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ access: access.scope, cases, map });
}
