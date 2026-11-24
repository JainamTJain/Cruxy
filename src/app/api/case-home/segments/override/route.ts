import { NextResponse } from "next/server";
import {
  canSeeAllTeams,
  resolveVisibleTeamId,
} from "@/lib/auth/team-privacy";
import { requireMemberSession } from "@/lib/case-brain/auth";
import { checkPointFallacy } from "@/lib/case-home/point-fallacy";
import { cleanSegmentBody } from "@/lib/library/clean-segment-text";
import { logActivity } from "@/lib/db/repository";
import {
  clearSegmentOverride,
  listOverridesForTeam,
  upsertSegmentOverride,
} from "@/lib/db/supabase/file-segment-overrides";
import { getSegmentById } from "@/lib/db/supabase/file-segments";

/**
 * Save or clear a team's wording override for one distilled Drive point.
 * Body: { segmentId, teamId?, body?, clear? }
 */
export async function POST(req: Request) {
  const auth = await requireMemberSession();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await req.json()) as {
    segmentId?: string;
    teamId?: string;
    body?: string;
    clear?: boolean;
  };
  if (!body.segmentId) {
    return NextResponse.json({ error: "segmentId required" }, { status: 400 });
  }

  const resolved = resolveVisibleTeamId({
    person: auth.person,
    session: auth.session,
    requested: body.teamId ?? auth.teamId,
  });
  if (!resolved.teamId) {
    return NextResponse.json(
      { error: "Needs a team membership." },
      { status: 403 },
    );
  }
  const teamId = resolved.teamId;
  if (
    !canSeeAllTeams(auth.person, auth.session) &&
    teamId !== auth.teamId
  ) {
    return NextResponse.json({ error: "Wrong team." }, { status: 403 });
  }

  const segment = await getSegmentById(body.segmentId);
  if (!segment) {
    return NextResponse.json({ error: "Point not found" }, { status: 404 });
  }

  if (body.clear) {
    await clearSegmentOverride({ teamId, segmentId: body.segmentId });
    await logActivity({
      person_id: auth.session.personId,
      action: "reading_point_override_cleared",
      target: body.segmentId,
      meta: { teamId, fileId: segment.file_id },
    });
    const display = cleanSegmentBody(segment.body) || segment.body;
    const fallacy = await checkPointFallacy({
      text: display,
      personId: auth.session.personId,
    });
    return NextResponse.json({
      ok: true,
      cleared: true,
      display_body: display,
      original_body: display,
      edited_by_name: null,
      edited_at: null,
      fallacy,
    });
  }

  const cleaned = cleanSegmentBody(body.body ?? "");
  if (!cleaned) {
    return NextResponse.json(
      { error: "Write a short point before saving." },
      { status: 400 },
    );
  }

  const existing = (await listOverridesForTeam(teamId, [body.segmentId]))[0];
  const originalBody =
    existing?.original_body ||
    cleanSegmentBody(segment.body) ||
    segment.body;

  const saved = await upsertSegmentOverride({
    teamId,
    segmentId: body.segmentId,
    body: cleaned,
    originalBody,
    editedBy: auth.session.personId,
  });

  await logActivity({
    person_id: auth.session.personId,
    action: "reading_point_override_saved",
    target: body.segmentId,
    meta: { teamId, fileId: segment.file_id },
  });

  const fallacy = await checkPointFallacy({
    text: cleaned,
    personId: auth.session.personId,
  });

  return NextResponse.json({
    ok: true,
    cleared: false,
    display_body: cleaned,
    original_body: saved.original_body,
    edited_by_name: auth.person.name,
    edited_at: saved.updated_at,
    fallacy,
  });
}
