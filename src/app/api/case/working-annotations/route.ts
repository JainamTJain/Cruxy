import { NextResponse } from "next/server";
import { isAdminRole } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth/session";
import { getPersonById, logActivity } from "@/lib/db/repository";
import {
  createWorkingAnnotation,
  listWorkingAnnotations,
  type WorkingAnnotationKind,
  type WorkingAnnotationTarget,
} from "@/lib/db/supabase/working-annotations-extra";
import type { Person, Role } from "@/lib/types";

export const runtime = "nodejs";

function canUseTeam(person: Person, teamId: string): boolean {
  if (isAdminRole(person.role as Role)) return true;
  return person.team_id === teamId;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const caseId = url.searchParams.get("caseId");
  const teamId = url.searchParams.get("teamId") || person.team_id;
  if (!caseId || !teamId) {
    return NextResponse.json(
      { error: "caseId and teamId required" },
      { status: 400 },
    );
  }
  if (!canUseTeam(person, teamId)) {
    return NextResponse.json({ error: "Wrong team" }, { status: 403 });
  }

  const rows = await listWorkingAnnotations({ caseId, teamId });
  const { listPeopleFull } = await import("@/lib/db/repository");
  const people = await listPeopleFull();
  const names = new Map(people.map((p) => [p.id, p.name]));
  return NextResponse.json({
    annotations: rows.map((a) => ({
      ...a,
      person_name: names.get(a.person_id) ?? null,
    })),
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    caseId?: string;
    teamId?: string;
    targetKind?: WorkingAnnotationTarget;
    targetId?: string;
    kind?: WorkingAnnotationKind;
    range?: string;
    body?: string | null;
  };

  const teamId = body.teamId || person.team_id;
  if (
    !body.caseId ||
    !teamId ||
    !body.targetKind ||
    !body.targetId ||
    !body.kind ||
    !body.range?.trim()
  ) {
    return NextResponse.json(
      { error: "caseId, targetKind, targetId, kind and range required" },
      { status: 400 },
    );
  }
  if (body.targetKind !== "passage" && body.targetKind !== "section") {
    return NextResponse.json({ error: "Bad targetKind" }, { status: 400 });
  }
  if (body.kind !== "highlight" && body.kind !== "comment") {
    return NextResponse.json({ error: "Bad kind" }, { status: 400 });
  }
  if (!canUseTeam(person, teamId)) {
    return NextResponse.json({ error: "Wrong team" }, { status: 403 });
  }
  if (body.kind === "comment" && !body.body?.trim()) {
    return NextResponse.json(
      { error: "Comment needs a body" },
      { status: 400 },
    );
  }

  const annotation = await createWorkingAnnotation({
    caseId: body.caseId,
    teamId,
    targetKind: body.targetKind,
    targetId: body.targetId,
    kind: body.kind,
    range: body.range.trim().slice(0, 400),
    body: body.kind === "comment" ? body.body!.trim() : body.body ?? null,
    personId: session.personId,
  });

  await logActivity({
    person_id: session.personId,
    action:
      body.kind === "highlight"
        ? "working_highlight_created"
        : "working_comment_created",
    target: annotation.id,
    meta: {
      caseId: body.caseId,
      teamId,
      targetKind: body.targetKind,
      targetId: body.targetId,
    },
  });

  return NextResponse.json({ annotation });
}
