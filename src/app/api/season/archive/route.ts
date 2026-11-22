import { NextResponse } from "next/server";
import { canWrite } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth/session";
import { getPersonById } from "@/lib/db/repository";
import {
  archiveSeasonAndFreeze,
  ensureRegionalSeason,
} from "@/lib/season/service";

/** POST: freeze the season read-only and start a clean next season (tech admin). */
export async function POST() {
  const session = await getSession();
  if (!session?.adminView) {
    return NextResponse.json({ error: "Admin view required." }, { status: 403 });
  }
  const person = await getPersonById(session.personId);
  if (!person || !canWrite(person.role, "season_rollover")) {
    return NextResponse.json(
      { error: "Only Jainam can archive a season." },
      { status: 403 },
    );
  }
  const season = await ensureRegionalSeason(person.id);
  const result = await archiveSeasonAndFreeze({
    seasonId: season.id,
    actorId: person.id,
  });
  return NextResponse.json({
    season: result.season,
    downloadPath: result.downloadPath,
    message:
      "Season archived read-only. Download the export for the Drive. A clean next season is ready.",
  });
}
