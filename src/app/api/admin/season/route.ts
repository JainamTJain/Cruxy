import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canWrite } from "@/lib/admin/permissions";
import { archiveSeasonStub, getPersonById, logActivity } from "@/lib/db/repository";
import {
  loadSeasonOps,
  waitingPayload,
} from "@/lib/db/supabase/admin-ops-bridge";

export const runtime = "nodejs";

/**
 * Season rollover: queue archive + build downloadable export (Drive SA is
 * read-only). Keeps Things bank, example library and glossary untouched.
 */
export async function POST() {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canWrite(person.role, "season_rollover")) {
    return NextResponse.json(
      { error: "Season rollover is technical admin only." },
      { status: 403 },
    );
  }

  const stub = await archiveSeasonStub(person.id);
  const ops = await loadSeasonOps();
  if (!ops) {
    return NextResponse.json({
      ...waitingPayload("I", "buildSeasonArchive"),
      queued: true,
      message: stub.message,
    });
  }

  const archive = await ops.buildSeasonArchive(person.id);
  await logActivity({
    person_id: person.id,
    action: "season_rollover_archive",
    target: archive.filename,
    meta: { bytes: archive.bytes },
  });

  return NextResponse.json({
    ok: true,
    queued: true,
    message:
      "Season archive ready to download. Import the next case set and reset roadmaps when ready. Things bank, example library and glossary stay.",
    filename: archive.filename,
    bytes: archive.bytes,
    downloadPath: archive.downloadPath ?? null,
  });
}
