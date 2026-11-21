import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canWrite } from "@/lib/admin/permissions";
import { getPersonById, logActivity } from "@/lib/db/repository";
import {
  loadSeasonOps,
  waitingPayload,
} from "@/lib/db/supabase/admin-ops-bridge";

export const runtime = "nodejs";

/** Tech admin: downloadable season archive (Drive SA is read-only). */
export async function POST() {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const actor = await getPersonById(session.personId);
  if (!actor || !canWrite(actor.role, "season_rollover")) {
    return NextResponse.json(
      { error: "Season export is technical admin only." },
      { status: 403 },
    );
  }

  const ops = await loadSeasonOps();
  if (!ops) {
    return NextResponse.json(
      waitingPayload("I", "buildSeasonArchive"),
      { status: 501 },
    );
  }

  const result = await ops.buildSeasonArchive(actor.id);
  await logActivity({
    person_id: actor.id,
    action: "season_archive_built",
    target: result.filename,
    meta: { bytes: result.bytes },
  });
  return NextResponse.json(result);
}
