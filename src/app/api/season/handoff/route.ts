import { NextResponse } from "next/server";
import { canWrite, isAdminRole } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth/session";
import { getPersonById, logActivity } from "@/lib/db/repository";
import { getHandoff, upsertHandoff } from "@/lib/db/supabase/season-extra";
import type { HandoffWhoDidWhat } from "@/lib/season/types";
import {
  ensureHandoffDraft,
  ensureRegionalSeason,
} from "@/lib/season/service";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const season = await ensureRegionalSeason(session.personId);
  const handoff =
    (await getHandoff(season.id)) ??
    (await ensureHandoffDraft({
      seasonId: season.id,
      actorId: session.personId,
    }));
  return NextResponse.json({ season, handoff });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !isAdminRole(person.role)) {
    return NextResponse.json(
      { error: "Only Dr. B or Jainam can edit the handoff guide." },
      { status: 403 },
    );
  }
  const season = await ensureRegionalSeason(session.personId);
  if (season.status === "archived" && !canWrite(person.role, "season_rollover")) {
    return NextResponse.json(
      { error: "This season is archived and read-only." },
      { status: 403 },
    );
  }
  const body = (await req.json()) as {
    body?: string;
    who_did_what?: HandoffWhoDidWhat[];
  };
  const existing = await getHandoff(season.id);
  const handoff = await upsertHandoff({
    seasonId: season.id,
    body: body.body ?? existing?.body ?? "",
    who_did_what: body.who_did_what ?? existing?.who_did_what ?? [],
    updatedBy: person.id,
  });
  await logActivity({
    person_id: person.id,
    action: "season_handoff_saved",
    target: season.id,
    meta: {},
  });
  return NextResponse.json({ handoff });
}
